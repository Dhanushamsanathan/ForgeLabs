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

1. Open **Compute → Connect server**.
2. Enter a server name, your SSH address/alias, and the server's `stt-tamil` folder.
3. Under **Advanced settings**, choose its training Python executable and an
   available GPU. Dataset/model roots and SSH port can also be customized.
4. Click **Download connector**, then run the displayed command on your Mac:

```sh
python3 ~/Downloads/forgelabs-connect-<worker-id>.py
```

The private connector includes the worker files and credential. It uses your
existing SSH login, sets up a loopback-only reverse tunnel to the local app,
installs the worker under `~/.local/share/forgelabs/<worker-id>/` on the GPU server,
and starts it. No separate clone, environment file editing, or tunnel command is
needed. The UI confirms connection only after a successful heartbeat.

Keep the terminal open and the Mac awake. Run the same connector again to
reconnect; it preserves run state and refuses a duplicate active worker. The
connector does not install CUDA or training dependencies, start a training job,
or modify your `stt-tamil` checkout. Choose Python 3.10+ from its existing training
environment. SSH host verification and login prompts remain in your terminal.

For a hosted HTTPS instance, choose **Direct to a hosted ForgeLabs**, copy the
connector onto the GPU server, activate its training environment, and run it
there. No SSH tunnel is used in this mode. Keep connector files private: they
contain a worker credential. The generated command contains no credential.

Advanced/manual deployments can still run `worker/agent.py --env-file worker.env`
with `FORGELABS_URL`, `FORGELABS_WORKER_ID`, `FORGELABS_WORKER_TOKEN`, `STT_REPO`,
`FORGELABS_DATA_ROOT`, `FORGELABS_MODEL_ROOT`, `FORGELABS_RUN_ROOT`, and
`CUDA_VISIBLE_DEVICES`. Use a service manager for a persistent hosted worker.
`HF_TOKEN`, when required, belongs in the training environment on the GPU server.
GPU telemetry reports all GPUs returned by `nvidia-smi`; `CUDA_VISIBLE_DEVICES`
controls training allocation.

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
