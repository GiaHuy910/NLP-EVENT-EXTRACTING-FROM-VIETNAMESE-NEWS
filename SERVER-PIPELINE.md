# Server NLP Pipeline

This guide covers backend architecture, model workflows, and evaluation. For local setup and
starting the API, use the quick-start instructions in [README.md](README.md). For corpus cleaning
and annotation export, see [DATA-PIPELINE.md](DATA-PIPELINE.md). Label definitions are in
[ANNOTATION-GUIDELINES.md](ANNOTATION-GUIDELINES.md).

## Backend components

- `server/src/ner_pipeline/`: NER schema, dataset preprocessing, PhoBERT training/inference,
  rule-based NER baseline, error analysis, and the active FastAPI application.
- `server/src/event_pipeline/`: event data validation, event rules, trigger/argument models,
  evaluation metrics, and command-line tools.
- `server/models/`: local checkpoints. The active API requires the NER checkpoint directly in this
  directory. Event model checkpoints under `event_trigger/` and `event_argument/` are optional for
  the API and are used by command-line event-model experiments.
- `server/datasets/`: local training/evaluation files and processed outputs.

## Active API

The app entry point is `server/src/ner_pipeline/app.py`. It loads `LegalExtractionPipeline` at
startup. The main route runs PhoBERT NER, then rule-based event and argument extraction. The
trigger-only route calls trigger rules without running NER. The file route accepts UTF-8 text.

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/process` | JSON `{"text": "..."}` (`input` is also accepted) | Entities and rule-based events |
| `POST /api/process/event-trigger` | JSON `{"text": "..."}` | Rule-based triggers |
| `POST /api/process-file` | Multipart file field named `file` containing UTF-8 text | Entities and rule-based events |

The API loads the NER checkpoint once when the application starts. A missing or incompatible
checkpoint prevents startup. Its event output is rule-based; it does not load the separate Part 2
PhoBERT checkpoints.

## NER workflow

NER training input is CSV with `sentence` and `entities` columns. Entity values use semicolon-
separated `TEXT|LABEL` entries or `NONE`. Preprocessing validates labels, aligns entity text to
sentence offsets, segments Vietnamese text, creates BIO labels, and writes processed JSONL under
`server/datasets/processed/`.

From `server/`, with the project Python environment active:

```powershell
python -m src.ner_pipeline.cli prepare-splits --train train_ner.csv --validation val_ner.csv --test test_ner.csv
python -m src.ner_pipeline.cli train
python -m src.ner_pipeline.cli baseline
python -m src.ner_pipeline.cli evaluate
python -m src.ner_pipeline.cli analyze
```

Training fine-tunes PhoBERT token classification. It selects a checkpoint using exact-span F1 on
validation; test data is reserved for final evaluation. The baseline command evaluates rule-based
NER; `evaluate` compares that baseline and PhoBERT on the same test split. `analyze` writes
sentence-level error categories to `server/datasets/processed/error-analysis.json`.

At inference, the API processes long text as overlapping PhoBERT windows with a maximum of 256
subword tokens per window and 64 subword tokens of overlap. It prefers sentence boundaries when
forming windows. Returned entity offsets refer to the normalized input text.

## Event workflow

The event-model dataset is sentence-level JSONL with `ann_id`, `sentence`, `entities`, `triggers`,
and `relations`. It is produced from Label Studio exports by the data pipeline. Event evaluation
uses exact character offsets and reports:

- Trigger identification and trigger classification (offsets, with or without event type).
- Argument identification (correct trigger and entity spans).
- Relation F1 (correct trigger, entity, and role).
- Event exact match (correct trigger and complete argument/role set).

Run commands from `server/`:

```powershell
python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --baseline
python -m src.event_pipeline.model train --task all --epochs 15
python -m src.event_pipeline.model predict --split test --trigger-source rules
python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --pred datasets/processed/test_event_pred_rules.jsonl
```

The event models separately predict trigger BIO tags and classify each trigger/entity pair into a
role or `NONE`. The evaluator uses gold entities by default, which isolates event extraction from
NER errors; pass predicted entities explicitly for a more end-to-end evaluation. Do not treat
gold-entity results as end-to-end pipeline scores.

## Tests

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = "$PWD\server"
python -m unittest discover -s server\test -p "test_*.py" -v
```

Unit tests cover annotation parsing and alignment, dataset integrity, NER metrics, long-text window
handling, API request/response behavior, and event metrics. They do not replace model evaluation on
held-out annotated data.
