# Quick Start Guide

The commands below use PowerShell on Windows. Expected results are listed at the end of each step
for comparison (see `RESULTS.md` for the full results).

## 1. Get the code

For a fresh clone:

```powershell
git clone https://github.com/GiaHuy910/NLP---Vietnamese-Crimes-.git vietnamese-crimes
cd vietnamese-crimes
git checkout ninh
```

If you already have the repository, update it:

```powershell
git fetch origin
git checkout ninh
git pull origin ninh
```

## 2. Set up the environment

Run these commands from `server/`. Python 3.10 or later is required.

```powershell
cd server
python -m venv .venv
.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ner.txt
```

If PowerShell blocks the activation script, run this first:
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`

From this point on, run commands from `server/` with the virtual environment activated
(the prompt should begin with `(.venv)`).

## 3. Install the models

The model files are not stored in Git. Download `ner_model.zip` from the
[GitHub Models release](https://github.com/GiaHuy910/NLP---Vietnamese-Crimes-/releases/tag/models-v1)
and extract it into `server/models/` so the directory structure looks like this:

```
server/
  models/
    config.json, model.safetensors, ...   (Part 1 NER model, directly inside models/)
```

The API requires the NER model at startup. The optional `event_models.zip` archive contains
checkpoints used by the command-line Part 2 experiments; the API below uses rule-based event
extraction and does not need those checkpoints.

## 4. Part 1: NER

### Run the entity-recognition API

Make sure the NER model is in `server/models/`, then run this from `server/`:

```powershell
uvicorn src.ner_pipeline.app:app --host 127.0.0.1 --port 3001 --reload
```

Keep the terminal open. The API documentation is at
`http://127.0.0.1:3001/docs`. Send text to `POST /api/process` using the `text` field:

```powershell
$body = @{ text = "Ngày 15/8, Công an quận Đống Đa đã khởi tố Nguyễn Văn A." } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/process -Method Post `
  -ContentType "application/json" -Body $body
```

The response contains `input_text`, an `entities` list, and an `events` list. Each entity has
`text`, `label`, `start`, and `end`. The API loads the NER model once when it starts. A missing or
incompatible model prevents startup.

The trigger-only endpoint uses rules and does not require the event-model checkpoints:

```powershell
$body = @{ text = "Công an đã khởi tố Nguyễn Văn A." } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3001/api/process/event-trigger -Method Post `
  -ContentType "application/json" -Body $body
```

It returns `input_text` and the `triggers` list produced by `detect_triggers`. The API also exposes
`POST /api/process-file` for UTF-8 text uploads sent as multipart form data with the field name
`file`.

The frontend sends requests to port `3001`; keep the backend running while using the client.

### Evaluate NER from the command line

```powershell
# Prepare splits from manually annotated data.
python -m src.ner_pipeline.cli prepare-splits --train train_ner.csv --validation val_ner.csv --test test_ner.csv

# Rule-based baseline (expected overall F1: 0.669).
python -m src.ner_pipeline.cli baseline

# PhoBERT (requires the NER model; expected overall F1: about 0.799).
python -m src.ner_pipeline.cli evaluate

# Analyze PhoBERT errors.
python -m src.ner_pipeline.cli analyze
```

## 5. Part 2: Trigger, Argument, and Relation

The rule-based baseline requires no model (expected test scores: Trigger F1 0.697,
Relation F1 0.589, Event EM 0.275):

```powershell
python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --baseline
```

Primary system: rules detect triggers and PhoBERT classifies roles (expected test scores:
Relation F1 0.609, Event EM 0.367):

```powershell
python -m src.event_pipeline.model predict --split test --trigger-source rules
python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --pred datasets/processed/test_event_pred_rules.jsonl
```

Run all three configurations (model, rules, gold) on a split. Change `test` to `val` to evaluate
the validation split:

```powershell
foreach ($src in "model","rules","gold") {
  $sfx = if ($src -eq "model") { "" } else { "_$src" }
  Write-Host "`n######## $src"
  python -m src.event_pipeline.model predict --split test --trigger-source $src
  python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --pred datasets/processed/test_event_pred$sfx.jsonl
}
```

Meaning of `--trigger-source`:
- `model`: PhoBERT detects triggers and classifies roles.
- `rules`: rules detect triggers and PhoBERT classifies roles (the selected system).
- `gold`: use manually annotated triggers with PhoBERT role classification (an upper bound for analysis).

View examples of baseline trigger errors:

```powershell
python -m src.event_pipeline.evaluate --gold datasets/test.jsonl --baseline --errors 30
```

## 6. Retrain the Part 2 models (optional)

Run on a GPU if possible (for example, a Google Colab T4 runtime). CPU training will be very slow.

```powershell
python -m src.event_pipeline.model train --task trigger --epochs 30
python -m src.event_pipeline.model train --task argument --epochs 15
```

The new models overwrite `server/models/event_trigger` and `server/models/event_argument`.
Checkpoints are selected using validation data; test data is not used during training.

## 7. Test the metrics

```powershell
python -m unittest discover -s test -p "test_event_metrics.py"
python -m unittest discover -s test -p "test_ner_app_api.py"
```

Expected output: `Ran 4 tests ... OK`.

## Common issues

| Error | Fix |
|---|---|
| `No module named 'src'` | You are not in `server/`. Run all commands from that directory. |
| `No module named 'torch'` / `transformers` / `underthesea` | The virtual environment is not active or dependencies are missing; repeat step 2. |
| `unrecognized arguments: --trigger-source` | The code is outdated; run `git pull origin ninh`. |
| `models/event_trigger` or `config.json` not found | The models were not extracted to the expected location. See step 3; avoid an extra nested `models/models/` directory. |
| `FileNotFoundError ... test_event_pred_rules.jsonl` | Run `predict` before `evaluate`. |
| `git add` reports `pathspec ... did not match` | You are in `server/`; run Git commands that use `server/...` paths from the repository root. |
