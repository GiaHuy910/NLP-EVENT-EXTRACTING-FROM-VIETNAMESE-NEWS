# Data Pipeline

This guide describes how the project corpus is cleaned, sampled, annotated, and exported. It covers
dataset construction only; entity/event label definitions are maintained separately in
[ANNOTATION-GUIDELINES.md](ANNOTATION-GUIDELINES.md), and server inference/evaluation details are in
[SERVER-PIPELINE.md](SERVER-PIPELINE.md).

## Data locations

The scripts in `data_pipeline/` use these project directories:

- `data/corpus news/`: raw and intermediate article CSVs. These files are not committed; obtain
  them from the project team.
- `data/annotation/`: annotation spreadsheets and Label Studio task exports.
- `data/dataset/`: exported sentence-level datasets for NER and event extraction.

## Processing workflow

Install the data-pipeline dependencies, then run the scripts from `data_pipeline/`:

```powershell
pip install -r data_pipeline/requirements.txt
```

Place `train_cleaned_labeled.csv`, `val_cleaned_labeled.csv`, and `test_cleaned_labeled.csv` in
`data/corpus news/`, then run the steps in order from `data_pipeline/`:

| Step | Command | Purpose | Main output |
|---|---|---|---|
| 1 | `python step1_fix_encoding.py` | Normalize Unicode, repair encoding issues, and remove hidden characters | Cleaned CSVs |
| 2 | `python step2_clean_news.py` | Remove captions/URLs, reconcile labels, and prevent document leakage across splits | Train/validation/test article CSVs |
| 3 | `python step3_apply_scope.py --apply` | Exclude the small Traffic Violations category | Filtered split CSVs |
| 4 | `python step4_split_sentences.py` | Split articles and keep sentences with 5–100 words | Sentence CSVs |
| 5 | `python step5_sample_for_annotation.py` | Sample by SubLabel, limiting each article to two sentences | Annotation spreadsheets |
| 6 | `python step6_to_labelstudio.py` | Create Label Studio tasks; training tasks include rule suggestions | Label Studio task JSON |
| 7 | `python step7_export_dataset.py <file.json> <name> [--gold-only]` | Export sentence annotations for both server pipelines | JSONL and NER CSV files |

The project configuration, including the random seed, sampling sizes, excluded categories, and
trigger lexicon, is in [data_pipeline/config.py](data_pipeline/config.py). The rules used to create
pre-annotations are in [data_pipeline/rules.py](data_pipeline/rules.py).

## Annotation and export

Annotators should follow [ANNOTATION-GUIDELINES.md](ANNOTATION-GUIDELINES.md). Training tasks can
contain rule-generated suggestions for entities and triggers; annotators must review and correct
them. Validation and test tasks are created without pre-labels. Relations are annotated manually.

Export the completed Label Studio files from the repository root, for example:

```powershell
python data_pipeline/step7_export_dataset.py data/annotation/train.json train --gold-only
python data_pipeline/step7_export_dataset.py data/annotation/val.json val --gold-only
python data_pipeline/step7_export_dataset.py data/annotation/test.json test --gold-only
```

The exporter writes `{split}.jsonl` and `{split}_ner.csv` under `data/dataset/`. Each JSONL row
represents one sentence and includes its metadata, entities, triggers, and trigger-to-entity
relations. Span offsets use character indices into the sentence. The NER CSV contains `sentence`
and `entities` columns; entity mentions use `TEXT|LABEL` items separated by semicolons.

Use `--gold-only` when exporting final evaluation data so that records based only on rule-generated
predictions are excluded. The exporter also normalizes reversed Label Studio relations to the
trigger-to-entity direction. Run the annotation checker after export:

```powershell
python data_pipeline/check_annotations.py data/annotation/train.json
```

The checker writes an issues CSV alongside the source file. Warnings are prompts for human review,
not automatic corrections. Review structural problems such as invalid role/entity combinations,
incorrect relation direction, missing roles, and offsets that include punctuation.

## Data-quality principles

- Keep the test split fixed; remove duplicates from validation and training rather than moving test
  examples.
- Training sampling is keyword-enriched to provide more event examples. Validation and test sampling
  is random so evaluation is not tailored to the trigger lexicon.
- `SubLabel` describes the source article and may not describe every sampled sentence.
- Preserve Vietnamese encoding. The scripts use UTF-8; avoid resaving source CSVs in spreadsheet
  software if that changes encoding.
- Close spreadsheets before scripts overwrite them. Use a separate environment for Label Studio if
  its dependencies conflict with the project's data-pipeline environment.

For the model schemas, preprocessing after export, and evaluation commands, see
[SERVER-PIPELINE.md](SERVER-PIPELINE.md).
