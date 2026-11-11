# ForgeLabs

A workspace for training models on your own infrastructure. Built with **Bun,
Vue 3, Nuxt 4 / Nitro, and MySQL**.

This first release provides a working job-management foundation and a bridge to
the existing Tamil Whisper LoRA training scripts. The product is designed to add
other model families through explicit training recipes.

## What works

- Password-protected operator workspace.
- MySQL-backed model, dataset, worker, and experiment registration.
- Worker pairing with per-server tokens; heartbeat and GPU telemetry.
- Parameter forms, immutable run configuration snapshots, and per-worker queues.
- Detached Python training execution, structured metrics, logs, and artifacts.
- Loss charts and Tamil/Latin-token evaluation from the original recipe.
- Cooperative cancellation, compatible-checkpoint resume, experiment duplication,
  and side-by-side configuration/metric comparisons.
- Local buffering and retry of worker events after API interruption.

No training data, GPUs, or successful runs are fabricated in the dashboard.
Audio upload/editing, inference comparisons, publishing, multi-user access,
remote artifact downloads, and additional training recipes are not included yet.

## Run locally

Requirements: Bun, MySQL 8 or compatible, and a database/user dedicated to this
application. The web application itself does not require a GPU or Python.

```sh
bun install
cp .env.example .env
```

Set the database connection, a workspace password, and a random session secret
in `.env`. Generate the secret with `openssl rand -hex 32`.

```dotenv
NUXT_DATABASE_URL=mysql://forgelabs:password@127.0.0.1:3306/forgelabs
NUXT_SESSION_SECRET=at-least-32-random-characters
NUXT_OPERATOR_PASSWORD=your-workspace-password
```

Create the configured database, then:

```sh
bun run db:migrate
bun run dev
```

Open **http://127.0.0.1:3100** and sign in with the configured workspace password.
The checked-in migration is additive and initializes only ForgeLabs tables.
The development bootstrap may create an ignored `.env` locally; never commit it.

## Connect your GPU server

1. Open **Compute → Connect server** and save the generated worker token.
2. Clone ForgeLabs on the GPU server.
3. Keep the existing `stt-tamil` checkout and its working Python environment.
   Its dependencies (PyTorch, Transformers, PEFT, datasets, jiwer, TensorBoard,
   audio decoding libraries) are not installed or altered by this application.
4. Create an environment file readable only by the worker owner:

```dotenv
FORGELABS_URL=https://your-forgelabs-host
FORGELABS_WORKER_ID=the-id-from-the-UI
FORGELABS_WORKER_TOKEN=the-token-shown-once
STT_REPO=/home/you/stt-tamil
FORGELABS_DATA_ROOT=/home/you/stt-tamil/data
FORGELABS_MODEL_ROOT=/home/you/models
FORGELABS_RUN_ROOT=/home/you/forgelabs-runs
CUDA_VISIBLE_DEVICES=0
# HF_TOKEN=...   Only if private Hugging Face repositories require it.
```

5. With the training Python environment activated, run:

```sh
python /path/to/ForgeLabs/worker/agent.py --env-file /path/to/worker.env
```

Use tmux or a service manager. The worker polls outward over HTTPS; ForgeLabs
does not require SSH credentials. Localhost is not reachable from another
machine: use a secured tunnel or host the API behind HTTPS. Only one agent
process may use a given worker ID. Explicitly assign a GPU to avoid conflicts
with other work on shared servers; telemetry currently reports all visible GPUs
from `nvidia-smi`, while `CUDA_VISIBLE_DEVICES` controls training allocation.

The API has single-operator authentication. This is not a hardened multi-tenant
public service: add tenant isolation, quotas, token rotation/revocation, and
production operational controls before offering it to untrusted users.

## First training experiment

1. **Models:** register a complete Whisper base model (for example
   `openai/whisper-large-v3`) or a local model directory inside the worker's
   configured model root. An adapter-only directory is not a base model.
2. **Datasets:** register one of the two supported sources:
   - JSONL manifest on the worker, inside `FORGELABS_DATA_ROOT`.
   - `google/fleurs` with configuration `ta_in`.
3. **New experiment:** choose the model, dataset, and worker; configure learning
   rate, batch size, gradient accumulation, epochs, LoRA rank, and optional
   compatible resume checkpoint.
4. The worker checks the recipe/environment and runs the original training
   script. The run page polls for metrics/logs; a disconnected browser does not
   stop training. Configuration changes apply to a new run, not a running one.

Manifest rows must have this shape:

```json
{"id":"speaker01_001","audio":"clips/001.flac","text":"உங்கள் details அனுப்புங்கள்","duration":4.2}
```

Use one JSON object per line. Audio is mono, up to 30 seconds per utterance;
paths resolve relative to the manifest and must remain within the data root.
IDs follow `speaker_utterance` so the original script can split by speaker.
At least two speakers are required. The worker checks all references and probes
up to 32 audio files with `ffprobe` (install FFmpeg on the server). The original
recipe resamples audio and filters oversized transcript labels.

Select the correct label provenance. Teacher-generated references measure
agreement with teacher labels, **not human-verified accuracy**. The UI displays
WER/CER fractions as percentages, without clamping values above 100%.

The original FLEURS recipe trains on train + validation and evaluates on test.
For repeated model selection, prepare separate development and final test
manifests instead of treating that repeatedly inspected test split as untouched.

## Checkpoints and recovery

Each run uses `<FORGELABS_RUN_ROOT>/<run-id>/` for its configuration, provenance,
events, logs, result, checkpoints, and adapter. Checkpoint retention is set to
two complete trainer checkpoints in the bridge. Reserve enough disk space for
optimizer states as well as weights; ForgeLabs does not promise that a run fits
based on parameter count alone.

Cancellation is observed at training-step boundaries and requests a checkpoint
save. Loading, preprocessing, and evaluation may delay it. Worker shutdown does
not kill its detached training child. Restart with the same worker ID and run
directory to recover tracking. Stale heartbeats are shown as unknown execution
state, and the queue does not automatically duplicate an uncertain active job.

Resume requires trainer, optimizer, and scheduler state, plus matching recorded
model reference, dataset/configuration, manifest checksum, script checksum, and
recipe Git revision. Preserve immutable dataset files and pin model references
operationally: the first release does not content-hash every audio file or pin
every Hugging Face repository revision automatically. A changed remote model or
modified audio at the same path is not detected by the manifest checksum.

Private normalization and lexicon code stays in `stt-tamil`; this repository
contains only the bridge and references to that checkout.

## Verify

```sh
bun run typecheck
bun test tests/validation.test.ts
bun run test:worker
bun run build
bun run test:integration --browser
```

The integration runner creates a uniquely named temporary MySQL database,
starts the compiled server on port 3181, exercises authentication and the job
lifecycle, optionally runs browser checks, then stops the server and drops only
that temporary database. The database account therefore needs create/drop
permissions for this check. Normal production accounts do not need those
permissions. Browser screenshots go to ignored `test-results/`.

Tests use isolated fixtures, not a real GPU training run. A real CUDA run,
interrupted-run resume, and adapter inference must still be validated on the
target server before treating the training integration as production-ready.

## Production process

```sh
bun run build
HOST=127.0.0.1 PORT=3100 bun --env-file=.env .output/server/index.mjs
```

Run behind an HTTPS reverse proxy, keep the process and database persistent,
back up MySQL and worker output directories, and supply credentials through your
deployment's secret management. Nuxt's `runtimeConfig` keeps database and login
credentials server-side.

See [CLAUDE.md](CLAUDE.md) for repository conventions and integration invariants.
