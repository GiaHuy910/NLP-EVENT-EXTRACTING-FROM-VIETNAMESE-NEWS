# Run the Application with Docker

This package runs the React frontend and FastAPI backend locally with Docker Compose. The NER model
is copied into the backend image, so users do not need to install Python, Node.js, npm, or download
the model separately. Docker Desktop is required.

## What is included

- The frontend is built as static files and served by Nginx.
- Nginx forwards `/api/` requests to the FastAPI backend over the private Compose network.
- The backend image contains the NER checkpoint from `server/models/`.
- The optional event-trigger and event-argument checkpoints are not included because the active API
  uses rule-based event extraction.
- Docker installs the smaller runtime dependency set in `server/requirements-docker.txt`; the
  existing `requirements-ner.txt` remains intended for the full backend development workflow.
- Only the frontend port is published to the host. The backend is not exposed directly.

The NER weights are not tracked by Git. The person preparing the handoff must include the following
files in `server/models/` before building or creating the handoff archive:

```text
server/models/
  added_tokens.json
  bpe.codes
  config.json
  model.safetensors
  tokenizer_config.json
  vocab.txt
```

The repository's `.dockerignore` deliberately excludes the optional event checkpoints to keep the
Docker build context and backend image smaller.

## Build and run

From the repository root, with Docker Desktop running:

```powershell
docker compose up --build -d
```

Open [http://localhost:8080](http://localhost:8080). The API documentation is available at
[http://localhost:8080/docs](http://localhost:8080/docs).

View service status and logs:

```powershell
docker compose ps
docker compose logs -f
```

Stop the application:

```powershell
docker compose down
```

The first build needs an internet connection to download base images and install dependencies. Once
images have been built, the application runs locally without needing to download model files at
startup.

## Prepare a handoff archive

Because Git ignores `server/models/`, cloning or downloading the Git repository alone does not
include the model. To hand this application to another person:

1. Make sure the NER files listed above are present under `server/models/`.
2. Build and test the app with `docker compose up --build -d`.
3. Stop it with `docker compose down`.
4. Create a ZIP of the project, including the ignored `server/models/` files. Exclude `.git`,
   `client/node_modules/`, `client/dist/`, and `server/.venv/`.
5. Send the ZIP and tell the recipient to install Docker Desktop, extract the archive, open a
   terminal in the project root, and run `docker compose up --build -d`.

The recipient can then browse to `http://localhost:8080`. On Windows, Docker Desktop must be running
and have enough memory available for the backend to load PhoBERT. The backend uses one worker to
avoid loading multiple copies of the model into memory.

## Troubleshooting

- **The backend image fails while copying `server/models/...`:** the NER model files are missing or
  nested in an unexpected directory. Put them directly in `server/models/`.
- **The frontend is unavailable while the backend starts:** the backend health check waits for the
  model to load before marking the frontend dependency ready. Inspect `docker compose logs backend`.
- **Port 8080 is already in use:** change the host side of `"8080:80"` in `compose.yaml`, for
  example to `"8081:80"`, then browse to the corresponding port.
- **The browser reports a connection error:** inspect `docker compose ps` and
  `docker compose logs --tail=100 backend frontend`.

Before sharing, verify that the model license permits redistribution with the application.
