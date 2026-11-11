# ForgeLabs — project guide

## Product and scope

ForgeLabs is our own platform for model training, dataset management, GPU
workers, experiment tracking, evaluation, and model artifacts. Keep the product
architecture extensible beyond speech, Whisper, and a single model family.

The first implemented training integration uses the existing `stt-tamil`
Whisper LoRA scripts. The current application implements its own worker/job
protocol; it does not depend on ClearML.

## Required stack

- **Bun** for dependency management, scripts, testing, and the production server.
- **Vue 3 / Nuxt 4** for the application and routes.
- **Nitro** for server APIs (provided by Nuxt).
- **MySQL** through `mysql2/promise` for persistent application data.
- **Python** for GPU workers and the bridge to existing training environments.

Use Bun and commit `bun.lock`. Do not introduce npm/pnpm/yarn lockfiles, replace
MySQL with an in-memory store, or migrate the application to React.

## Repository map

| Location | Responsibility |
| --- | --- |
| `app/pages/` | Overview, experiments, compute, models, datasets, login, settings |
| `app/components/` | Shared UI, status badges, run tables, and metric plots |
| `app/assets/main.css` | Responsive product styling |
| `app/composables/` | Workspace fetching, notices, and presentation helpers |
| `app/middleware/` | Page authentication redirects |
| `server/api/` | Operator APIs and worker endpoints |
| `server/middleware/auth.ts` | API authentication and origin checks |
| `server/utils/` | MySQL access, schema, validation helpers, authentication |
| `shared/` | Types and input validation shared across the application |
| `scripts/migrate.ts` | Database schema setup |
| `worker/agent.py` | Outbound polling, telemetry, job execution, log/event delivery |
| `worker/runner.py` | Detached process and Transformers callback bridge |
| `worker/recipe.py` | Recipe arguments, path checks, dataset checks, resume validation |
| `tests/`, `worker/tests/` | Application and worker regression tests |

## Local development

```sh
bun install
# Copy .env.example to .env and configure credentials.
# Create the configured database on your MySQL instance first.
bun run db:migrate
bun run dev
```

The development URL is `http://127.0.0.1:3100`. Required private environment
variables are `NUXT_DATABASE_URL`, `NUXT_SESSION_SECRET` (at least 32 characters),
and `NUXT_OPERATOR_PASSWORD`. Nuxt loads `.env` in development; production must
receive the variables through its process environment or Bun's environment-file
support. Never commit or print the local `.env` or workspace credentials.

```sh
bun run typecheck
bun test tests
bun run test:worker
bun run build
bun run start
```

Run meaningful checks for the changed behavior. Typechecking and compilation do
not prove a GPU training run works. Report exactly which checks passed and which
require access to the target worker. Never start a real training run or download
large weights just to verify a UI change.

## Training integration

The existing local checkout is:

`/Users/dhanushamsanathan/Documents/GitHub/stt-tamil`

Read that repository's own guidance before changing it. ForgeLabs references an
external checkout through `STT_REPO`; do not hardcode this laptop path into the
worker. Keep its Python environment separate from the web application.

- `scripts/train_relabeled.py`: local JSONL manifests, speaker-disjoint split,
  and Tamil/Latin-token evaluation.
- `scripts/train_lora.py`: Tamil FLEURS (`google/fleurs`, `ta_in`).
- `worker/runner.py` adds callbacks at runtime, then invokes the original script.
- Preserve transcript-length filtering and on-the-fly audio feature extraction.
- Do not copy or publish `stt-tamil` private normalization, lexicon, corpus data,
  credentials, or other proprietary pipeline code into ForgeLabs.
- Teacher-generated labels measure agreement with a teacher, not human ground
  truth. Keep label provenance visible beside reported evaluation results.
- Do not claim arbitrary models or datasets work just because a reference can be
  entered. Every architecture needs an explicit compatible training recipe.

## Worker protocol and invariants

1. An operator registers a worker; its random token is returned once. MySQL
   stores only the token hash.
2. The worker authenticates with `Authorization: Bearer …` and `X-Worker-Id`.
3. Heartbeats report hardware and the active run. Stale heartbeats mean unknown
   execution state, not proof that training stopped.
4. Queue claiming uses a database transaction and locks the server row. One
   worker must not run multiple training jobs concurrently.
5. A run snapshots its model, dataset, recipe, and parameters. Preserve historical
   inputs when adding editing features.
6. Training executes in a detached child. Events, logs, result, and acknowledged
   delivery offsets persist on disk so browser closure and connection loss do
   not discard training output.
7. Events carry stable IDs for idempotent delivery. Completion must also be
   idempotent; retrying must not duplicate artifact records.
8. Cancellation is cooperative at training-step boundaries. Loading or
   preprocessing may take time before it observes cancellation.
9. Resume requires a complete compatible checkpoint, not merely adapter weights.
   Do not silently restart a job when its execution state is uncertain.
10. Use argument lists, never shell interpolation, for subprocess execution.
    Enforce configured roots and resolve symlinks when accessing worker paths.

Worker configuration:

```text
FORGELABS_URL=https://your-reachable-api
FORGELABS_WORKER_ID=<registered-id>
FORGELABS_WORKER_TOKEN=<one-time-token>
STT_REPO=/path/to/stt-tamil
FORGELABS_DATA_ROOT=/path/to/datasets
FORGELABS_MODEL_ROOT=/path/to/local-models
FORGELABS_RUN_ROOT=/path/to/forgelabs-runs
CUDA_VISIBLE_DEVICES=0
```

Launch with the training environment's Python:

```sh
python worker/agent.py --env-file /path/to/worker.env
```

`HF_TOKEN`, if needed, belongs only in the worker environment. Use HTTPS or a
private secured tunnel for remote connections. Do not bypass shared-server GPU
scheduling or alter another project's running processes.

## UI and API conventions

- Product name: **ForgeLabs**. Broad platform language, recipe-specific controls.
- Keep the dark navigation, warm neutral workspace, and restrained orange accent.
- Responsive layouts, labeled controls, keyboard-operable dialogs, visible errors.
- Real database-backed records and accurate empty states. Never present simulated
  training, GPU telemetry, success notifications, or seeded metrics as live data.
- Validate server inputs with Zod, use parameterized SQL, and scope worker APIs to
  their own registered server/runs. Client validation is not authorization.
- Single-operator cookie authentication is the first release's access model.
  Multi-user tenancy requires explicit schema and authorization work.

## Current boundaries

The first release registers existing model/dataset references and runs supported
Whisper recipes. It is not a complete implementation of every planned product
screen. Audio uploads/editing, remote artifact downloads, inference comparison,
Hugging Face publishing, multi-user workspaces, and additional model families are
future work. Do not expose active controls for unimplemented actions or describe
those features as shipped.

Before expanding the UI, verify one real worker training run, checkpoint recovery,
saved-adapter reload, and evaluation on the intended data. Preserve original
datasets and other repositories; isolate test records and clean them up by their
specific IDs.
