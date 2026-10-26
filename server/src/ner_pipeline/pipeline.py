from pathlib import Path
import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer, AutoConfig

from .errors import NERPipelineError
from .paths import MODEL_DIR
from .schema import LABELS
from .event_module import extract_events
from .phobert import _tokenize_words, ID_TO_LABEL, spans_from_bio
from .alignment import _underthesea_segments, _segment_offsets


def _chunk_token_ranges(
    subword_counts: list[int],
    sentence_boundaries: set[int],
    *,
    max_length: int,
    overlap_subwords: int,
) -> list[tuple[int, int]]:
    content_limit = max_length - 2
    if content_limit < 1:
        raise NERPipelineError("max_length must leave room for model special tokens.")
    if any(count < 1 for count in subword_counts):
        raise NERPipelineError("Every segmented word must produce at least one subword.")

    ranges = []
    start = 0
    while start < len(subword_counts):
        end = start
        subword_total = 0
        while (
            end < len(subword_counts)
            and subword_total + subword_counts[end] <= content_limit
        ):
            subword_total += subword_counts[end]
            end += 1

        if end == start:
            raise NERPipelineError(
                f"A word exceeds the model's {content_limit}-subword window."
            )

        if end < len(subword_counts):
            sentence_ends = [
                boundary
                for boundary in sentence_boundaries
                if start < boundary <= end
            ]
            if sentence_ends:
                end = max(sentence_ends)

        ranges.append((start, end))
        if end == len(subword_counts):
            break

        next_start = end
        overlap_total = 0
        while next_start > start + 1 and overlap_total < overlap_subwords:
            next_start -= 1
            overlap_total += subword_counts[next_start]
        start = next_start

    return ranges


def _sentence_boundary_positions(
    sentence: str,
    tokens_with_offsets: list[tuple[str, int, int]],
) -> set[int]:
    boundaries = set()
    for index, (token, _, end) in enumerate(tokens_with_offsets):
        if token in {".", "!", "?"} and (
            end == len(sentence) or sentence[end].isspace()
        ):
            boundaries.add(index + 1)
        if index + 1 < len(tokens_with_offsets):
            next_start = tokens_with_offsets[index + 1][1]
            if "\n" in sentence[end:next_start]:
                boundaries.add(index + 1)
    return boundaries


class LegalExtractionPipeline:
    def __init__(self, model_dir: Path = MODEL_DIR):
        print("Initializing the legal extraction pipeline and loading PhoBERT...")
        if not (model_dir / "config.json").is_file():
            raise NERPipelineError(f"Không tìm thấy model tại {model_dir}")
            
        config = AutoConfig.from_pretrained(model_dir)
        if config.num_labels != len(LABELS):
             raise NERPipelineError("Cấu hình nhãn của Checkpoint không khớp với Schema hiện tại.")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, use_fast=True)
        self.model = AutoModelForTokenClassification.from_pretrained(model_dir).to(self.device)
        self.model.eval()
        self.max_length = 256
        self.overlap_subwords = 64
        print(f"Pipeline initialized on device: {self.device}")

    def _predict_ner_internal(self, text: str) -> list[dict]:
        import unicodedata

        sentence = unicodedata.normalize("NFC", text)
        segments = _underthesea_segments(sentence)
        tokens_with_offsets = _segment_offsets(sentence, segments)

        tokens = [token for token, _, _ in tokens_with_offsets]
        if self.tokenizer.is_fast:
            encoded_all = self.tokenizer(
                tokens,
                is_split_into_words=True,
                truncation=False,
                add_special_tokens=False,
            )
            word_ids = encoded_all.word_ids()
            subword_counts = [0] * len(tokens)
            for word_id in word_ids:
                if word_id is not None:
                    subword_counts[word_id] += 1
        else:
            subword_counts = [
                len(self.tokenizer.tokenize(token)) or 1 for token in tokens
            ]

        if any(count == 0 for count in subword_counts):
            raise NERPipelineError(
                "PhoBERT tokenization could not align every segmented word."
            )

        ranges = _chunk_token_ranges(
            subword_counts,
            _sentence_boundary_positions(sentence, tokens_with_offsets),
            max_length=self.max_length,
            overlap_subwords=self.overlap_subwords,
        )

        token_starts = {
            start: index
            for index, (_, start, _) in enumerate(tokens_with_offsets)
        }
        token_ends = {
            end: index
            for index, (_, _, end) in enumerate(tokens_with_offsets)
        }
        selected_spans: dict[tuple[int, int], tuple[str, int]] = {}
        self.model.eval()

        for chunk_start, chunk_end in ranges:
            chunk_tokens = tokens[chunk_start:chunk_end]
            encoded = _tokenize_words(
                self.tokenizer, chunk_tokens, self.max_length
            )
            chunk_word_ids = encoded.word_ids()
            inputs = {
                name: torch.tensor(
                    [encoded[name]], dtype=torch.long, device=self.device
                )
                for name in self.tokenizer.model_input_names
                if name in encoded
            }

            with torch.no_grad():
                logits = self.model(**inputs).logits[0]

            word_labels = [None] * len(chunk_tokens)
            for token_index, word_id in enumerate(chunk_word_ids):
                if word_id is not None and word_labels[word_id] is None:
                    word_labels[word_id] = ID_TO_LABEL[
                        int(logits[token_index].argmax().item())
                    ]

            token_offsets = [
                [start, end]
                for _, start, end in tokens_with_offsets[chunk_start:chunk_end]
            ]
            spans = spans_from_bio(
                token_offsets, [label or "O" for label in word_labels]
            )
            for start, end, label in spans:
                start_token = token_starts[start]
                end_token = token_ends[end] + 1

                if chunk_start > 0 and start_token == chunk_start:
                    continue
                if chunk_end < len(tokens) and end_token == chunk_end:
                    continue

                margin = min(
                    start_token - chunk_start,
                    chunk_end - end_token,
                )
                key = (start, end)
                current = selected_spans.get(key)
                if current is None or margin > current[1]:
                    selected_spans[key] = (label, margin)

        return [
            {"text": sentence[start:end], "label": label, "start": start, "end": end}
            for (start, end), (label, _) in sorted(selected_spans.items())
        ]

    def process(self, text: str) -> dict:
        if not text.strip():
            return {"error": "Văn bản đầu vào trống"}

        try:
            ner_results = self._predict_ner_internal(text)
            events = extract_events(text, ner_results)

            return {
                "text": text,
                "entities": ner_results,
                "events": events
            }
        except Exception as e:
            return {"error": f"Lỗi trong quá trình xử lý: {str(e)}"}