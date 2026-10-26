import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server.src.ner_pipeline.alignment import align_example, surface_tokens
from server.src.ner_pipeline.dataset import (
    deduplicate_records,
    ensure_splits_disjoint,
    prepare_dataset,
    save_annotation_csv,
    save_bio_csv,
)
from server.src.ner_pipeline.errors import NERPipelineError
from server.src.ner_pipeline.metrics import metrics_from_spans, score_spans
from server.src.ner_pipeline.phobert import _class_weights, predict_sentence
from server.src.ner_pipeline.pipeline import LegalExtractionPipeline, _chunk_token_ranges
from server.src.ner_pipeline.schema import AnnotatedExample, Mention, parse_entities


def whitespace_segmenter(sentence: str) -> list[str]:
    return [token for token, _, _ in surface_tokens(sentence)]


class AnnotationParsingTests(unittest.TestCase):
    def test_only_supported_entity_labels_are_accepted(self) -> None:
        self.assertEqual(parse_entities("NONE", row_number=2), ())
        with self.assertRaises(NERPipelineError):
            parse_entities("Value|EVENT", row_number=2)
        with self.assertRaises(NERPipelineError):
            parse_entities("", row_number=2)

    def test_alignment_handles_punctuation_repeats_and_whitespace(self) -> None:
        sentence = "Alpha  Beta, Alpha Beta."
        example = AnnotatedExample(
            sentence,
            (Mention("Alpha Beta", "PERSON", -1, -1),),
        )
        record = align_example(
            example, row_number=2, segmenter=whitespace_segmenter
        )
        self.assertEqual(record["labels"], ["B-PERSON", "I-PERSON", "O", "B-PERSON", "I-PERSON", "O"])
        self.assertEqual(len(record["entities"]), 2)

    def test_alignment_accepts_underscore_segment_tokens(self) -> None:
        sentence = "Quang Tri, Quang Tri."
        example = AnnotatedExample(
            sentence,
            (Mention("Quang Tri", "LOCATION", -1, -1),),
        )
        record = align_example(
            example,
            row_number=2,
            segmenter=lambda _: ["Quang_Tri", ",", "Quang_Tri", "."],
        )
        self.assertEqual(record["labels"], ["B-LOCATION", "O", "B-LOCATION", "O"])

    def test_entity_boundary_splits_a_segmented_multi_syllable_token(self) -> None:
        sentence = "chùa Giáng nằm ven sông."
        example = AnnotatedExample(
            sentence,
            (Mention("chùa Giáng", "LOCATION", -1, -1),),
        )
        record = align_example(
            example,
            row_number=2,
            segmenter=lambda _: ["chùa", "Giáng_nằm", "ven", "sông", "."],
        )
        self.assertEqual(
            record["labels"],
            ["B-LOCATION", "I-LOCATION", "O", "O", "O", "O"],
        )

    def test_equal_label_overlapping_mentions_keep_the_longer_span(self) -> None:
        sentence = "Chánh văn phòng Trung ương Giáo hội"
        example = AnnotatedExample(
            sentence,
            (
                Mention("Chánh văn phòng Trung ương", "ORGANIZATION", -1, -1),
                Mention("Trung ương Giáo hội", "ORGANIZATION", -1, -1),
            ),
        )
        record = align_example(
            example,
            row_number=2,
            segmenter=whitespace_segmenter,
        )
        self.assertEqual(
            [entity["text"] for entity in record["entities"]],
            ["Chánh văn phòng Trung ương"],
        )
        self.assertEqual(record["overlapping_entities_removed"], 1)

    def test_numeric_tokens_can_follow_without_whitespace(self) -> None:
        sentence = "0h 12.700.000đ"
        from server.src.ner_pipeline.alignment import _segment_offsets

        tokens = _segment_offsets(sentence, ["0", "h", "12", ".", "700", ".", "000", "đ"])
        self.assertEqual(
            [sentence[start:end] for _, start, end in tokens],
            ["0", "h", "12", ".", "700", ".", "000", "đ"],
        )

    def test_alignment_tolerates_equivalent_vietnamese_tone_mark_placement(self) -> None:
        sentence = "sức khoẻ"
        from server.src.ner_pipeline.alignment import _segment_offsets

        tokens = _segment_offsets(sentence, ["sức", "khỏe"])
        self.assertEqual(
            [sentence[start:end] for _, start, end in tokens],
            ["sức", "khoẻ"],
        )


class DatasetIntegrityTests(unittest.TestCase):
    def test_conflicting_duplicate_sentences_are_rejected(self) -> None:
        first = {
            "sentence": "same sentence",
            "entities": [{"text": "same", "label": "PERSON", "start": 0, "end": 4}],
        }
        second = {
            "sentence": "Same   sentence",
            "entities": [{"text": "Same", "label": "LOCATION", "start": 0, "end": 4}],
        }
        with self.assertRaises(NERPipelineError):
            deduplicate_records([first, second])

    def test_predefined_splits_reject_cross_split_duplicates(self) -> None:
        record = {
            "sentence": "Repeated sentence",
            "entities": [],
        }
        with self.assertRaisesRegex(NERPipelineError, "both train and test"):
            ensure_splits_disjoint({"train": [record], "test": [record]})

    def test_missing_dataset_reports_actionable_message(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(NERPipelineError):
                prepare_dataset(
                    str(Path(directory) / "missing.csv"),
                    seed=42,
                    test_ratio=0.15,
                    validation_ratio=0.15,
                )

    def test_annotation_and_bio_csv_exports(self) -> None:
        record = {
            "sentence": "A met B.",
            "entities": [
                {"text": "A", "label": "PERSON", "start": 0, "end": 1},
            ],
            "tokens": ["A", "met", "B", "."],
            "labels": ["B-PERSON", "O", "O", "O"],
            "token_offsets": [[0, 1], [2, 5], [6, 7], [7, 8]],
        }
        with tempfile.TemporaryDirectory() as directory:
            annotation_path = Path(directory) / "train.csv"
            bio_path = Path(directory) / "train_bio.csv"
            save_annotation_csv([record], annotation_path)
            save_bio_csv([record], bio_path)
            annotation_text = annotation_path.read_text(encoding="utf-8-sig")
            self.assertIn("sentence,entities", annotation_text)
            self.assertIn("A|PERSON", annotation_text)
            with bio_path.open(encoding="utf-8-sig", newline="") as file:
                rows = list(csv.DictReader(file))
            self.assertEqual(rows[0]["label"], "B-PERSON")
            self.assertEqual(len(rows), 4)


class MetricTests(unittest.TestCase):
    def test_exact_span_metrics(self) -> None:
        result = metrics_from_spans([(0, 4, "PERSON")], [(0, 4, "PERSON"), (5, 9, "LOCATION")])
        self.assertEqual(result["precision"], 0.5)
        self.assertEqual(result["recall"], 1.0)

    def test_corpus_metrics_keep_identical_offsets_in_separate_sentences(self) -> None:
        span = (0, 4, "PERSON")
        result = score_spans([[span], [span]], [[span], []])
        self.assertEqual(result["overall"]["precision"], 1.0)
        self.assertEqual(result["overall"]["recall"], 0.5)

    def test_prediction_without_a_checkpoint_reports_missing_model(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(NERPipelineError, "chưa được train"):
                predict_sentence("unprocessed sentence", model_dir=Path(directory))

    def test_class_weights_reduce_majority_label_dominance(self) -> None:
        weights = _class_weights(
            [{"labels": ["O"] * 9 + ["B-PERSON"]}],
            power=0.5,
        )
        self.assertGreater(weights[1], weights[0])


class LongTextInferenceTests(unittest.TestCase):
    def test_sliding_windows_cover_long_inputs_with_overlap(self) -> None:
        ranges = _chunk_token_ranges(
            [1] * 600,
            set(),
            max_length=256,
            overlap_subwords=64,
        )

        self.assertGreater(len(ranges), 2)
        self.assertEqual(ranges[0][0], 0)
        self.assertEqual(ranges[-1][1], 600)
        for (start, end), (next_start, _) in zip(ranges, ranges[1:]):
            self.assertLessEqual(end - start, 254)
            self.assertGreaterEqual(end - next_start, 64)

    def test_chunks_prefer_sentence_boundaries_when_possible(self) -> None:
        ranges = _chunk_token_ranges(
            [1] * 20,
            {8, 16},
            max_length=10,
            overlap_subwords=2,
        )
        self.assertEqual(ranges[0], (0, 8))

    def test_inference_handles_more_than_256_words(self) -> None:
        import torch
        from types import SimpleNamespace

        class FakeEncoding(dict):
            def __init__(self, values, word_ids):
                super().__init__(values)
                self._word_ids = word_ids

            def word_ids(self):
                return self._word_ids

        class FakeTokenizer:
            is_fast = True
            model_input_names = ["input_ids", "attention_mask"]

            def __call__(
                self,
                tokens,
                *,
                is_split_into_words,
                truncation=False,
                add_special_tokens=True,
            ):
                del is_split_into_words, truncation
                word_ids = list(range(len(tokens)))
                input_ids = [2] * len(tokens)
                if add_special_tokens:
                    input_ids = [101, *input_ids, 102]
                    word_ids = [None, *word_ids, None]
                return FakeEncoding(
                    {
                        "input_ids": input_ids,
                        "attention_mask": [1] * len(input_ids),
                    },
                    word_ids,
                )

        class FakeModel:
            device = torch.device("cpu")

            def __init__(self):
                self.sequence_lengths = []

            def eval(self):
                return self

            def __call__(self, input_ids, attention_mask):
                del attention_mask
                self.sequence_lengths.append(input_ids.shape[1])
                logits = torch.zeros(
                    (1, input_ids.shape[1], 17), dtype=torch.float32
                )
                logits[:, :, 0] = 1
                return SimpleNamespace(logits=logits)

        sentence = " ".join(f"word{index}" for index in range(600))
        pipeline = LegalExtractionPipeline.__new__(LegalExtractionPipeline)
        pipeline.tokenizer = FakeTokenizer()
        pipeline.model = FakeModel()
        pipeline.device = torch.device("cpu")
        pipeline.max_length = 256
        pipeline.overlap_subwords = 64

        with patch(
            "server.src.ner_pipeline.pipeline._underthesea_segments",
            side_effect=lambda text: text.split(),
        ):
            entities = pipeline._predict_ner_internal(sentence)

        self.assertEqual(entities, [])
        self.assertGreater(len(pipeline.model.sequence_lengths), 1)
        self.assertLessEqual(max(pipeline.model.sequence_lengths), 256)


if __name__ == "__main__":
    unittest.main()

import json

from server.src.ner_pipeline.argument_schema import (
    ARGUMENT_TYPES,
    arguments_for_ner_label,
    load_argument_schema,
    normalize_ner_label,
)
from server.src.ner_pipeline.errors import NERPipelineError


def test_argument_schema_contains_expected_labels():
    schema = load_argument_schema()

    assert len(schema["ner_labels"]) == 8
    assert set(schema["argument_mapping"]) == set(ARGUMENT_TYPES)
    assert set(schema["ner_labels"]) == {
    "PERSON",
    "ORGANIZATION",
    "LOCATION",
    "TIME",
    "MONEY",
    "PRODUCT",
    "DRUG",
    "CRIME",
}


def test_legacy_labels_are_normalized():
    assert normalize_ner_label("ORGANIZATION") == "ORGANIZATION"
    assert normalize_ner_label("LOCATION") == "LOCATION"
    assert normalize_ner_label("PERSON") == "PERSON"


def test_organization_argument_mapping():
    assert set(arguments_for_ner_label("ORGANIZATION")) == {
        "DOI_TUONG",
        "NAN_NHAN",
        "CO_QUAN",
    }


def test_unknown_ner_label_is_rejected():
    try:
        normalize_ner_label("UNKNOWN_LABEL")
    except NERPipelineError:
        pass
    else:
        raise AssertionError("Expected NERPipelineError")


def test_schema_rejects_unknown_mapping_label(tmp_path):
    source = load_argument_schema()
    source["argument_mapping"]["CO_QUAN"] = ["UNKNOWN_LABEL"]

    path = tmp_path / "invalid_schema.json"
    path.write_text(
        json.dumps(source, ensure_ascii=False),
        encoding="utf-8",
    )

    try:
        load_argument_schema(path)
    except NERPipelineError:
        pass
    else:
        raise AssertionError("Expected NERPipelineError")
