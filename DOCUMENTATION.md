# Documentation Guide

This page explains the purpose of each Markdown file in the repository and suggests a reading
order. Use it to find the right guide for your task.

## Root-level documentation

| File | Purpose | When to read |
|---|---|---|
| [README.md](README.md) | Introduces the project and explains how to install dependencies, download the model, and run the frontend and API on Windows. This is the primary getting-started guide. | When cloning the project or setting up the application. |
| [DATA-PIPELINE.md](DATA-PIPELINE.md) | Describes corpus cleaning, sentence splitting, sampling, Label Studio task creation, data checks, and dataset export. | When recreating or understanding the dataset preparation workflow. |
| [ANNOTATION-GUIDELINES.md](ANNOTATION-GUIDELINES.md) | Defines the 8 entity labels, 8 event trigger types, 10 relation roles, and annotation review rules. | When annotating or reviewing data, or interpreting gold labels. |
| [SERVER-PIPELINE.md](SERVER-PIPELINE.md) | Explains the backend structure, API endpoints, NER/event workflows, training, evaluation, and tests. | When developing the backend or understanding how input text is processed. |
| [RESULTS.md](RESULTS.md) | Summarizes the datasets, evaluation methods, experimental results, error analysis, and limitations. | When reviewing current system quality or experimental conclusions. |
| [RUN.md](RUN.md) | A short navigation page linking to setup, data, annotation, and results documentation. Detailed installation and startup instructions are in `README.md`. | As a shortcut, including when following an existing link to this file. |
| [DOCKER.md](DOCKER.md) | Explains how to build and run the local Docker package and prepare an archive that includes the NER model for handoff. | When packaging the application for another computer without deploying it to a server. |

## Documentation in subdirectories

| File | Purpose | Notes |
|---|---|---|
| [client/README.md](client/README.md) | The default React, TypeScript, and Vite template README, covering the template, React Compiler, and ESLint configuration. | It does not document this project's NLP interface. Use the root README for application setup and startup. |
| [server/src/event_pipeline/README.md](server/src/event_pipeline/README.md) | Detailed documentation for Part 2: schema, data format, metrics, baseline, trigger/argument models, and evaluation commands. | Read alongside [SERVER-PIPELINE.md](SERVER-PIPELINE.md); this file focuses specifically on the event pipeline module. |

## Recommended reading order

1. Start with [README.md](README.md) to install and run the application.
2. Read [SERVER-PIPELINE.md](SERVER-PIPELINE.md) to understand the API and NER/event workflows.
3. Read [DATA-PIPELINE.md](DATA-PIPELINE.md) to understand where the data comes from and how it is prepared.
4. Refer to [ANNOTATION-GUIDELINES.md](ANNOTATION-GUIDELINES.md) when interpreting labels or reviewing annotations.
5. Read [RESULTS.md](RESULTS.md) for results, errors, and limitations. For more implementation details on Part 2, also consult the event pipeline README.

The root README is the primary usage guide. The other documents cover separate topics so that
installation, API, dataset, and results information does not need to be repeated in every file.
