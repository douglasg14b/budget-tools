# Implementation plan: API read path (Phase 1)

Maps to [PRD §6.1–6.2](./PRD.md#61-api--categorization-endpoints) and [PRD §11 Phase 1](./PRD.md#phase-1--read-path).

## Goal

The API can load a review queue of AI proposals joined to local transaction details, and can serve the category catalog for a later picker. When complete:

- `GET /api/categories` returns nested groups from Postgres
- `GET /api/categorization/queue` returns `{ summary, generatedAt, llm, items }` with locally scored proposal + transaction per item
- `POST /api/categorization/llm-suggest` returns a just-in-time category/payee overlay for one scored queue transaction
- Query filters (`tier`, `accountId`) apply in TypeScript after a cached CLI run — they do not re-spawn
- `pnpm --filter @budget-tools/api tsoa` regenerates OpenAPI; `web-sdk` rebuilds typed hooks
- `pnpm check` still passes

## Out of scope

- Review UI (`ui-review-queue.md`) — keep the disabled Review nav
- Decisions, outbound queue, YNAB PATCH (`api-write-path.md`)
- `GET /api/payees` — no payees table; parked on the write path
- `GET /stats`, `GET /categorization/transactions/{id}`
- Auto-apply, batch LLM scoring as a queue cache key

## Design decisions

**CLI is a subprocess, not per-filter.** `predict-json` scores only the transaction ids the API passes (`--ids`). Model load still dominates a spawn, so the HTTP layer must not spawn once per filter change.

- **Working set:** `CATEGORIZATION_QUEUE_BATCH_SIZE` (default 50). First GET scores the newest pending batch. Later GETs reuse cache until the valid working set drops below the batch size (assigned or edited transactions), then another batch is scored. `expand=true` scores the next never-scored batch without discarding the current working set (prefetch / infinite scroll). `refresh=true` ignores `expand`. Concurrent queue loads are serialized so two GETs cannot spawn `predict-json` at once.
- **Cache:** JSON files under `CATEGORIZATION_QUEUE_CACHE_DIR` (default `apps/api/.cache/categorization-queue`) for local `predict-json` scores. Single-flight so concurrent GETs share one spawn. Survives API restarts. LLM overlays are stored separately (`llm-overlays.json`, keyed by transaction fingerprint) and are not a `predict-json` spawn. The overlay file is deleted when the API process starts; within a process, matching fingerprints are still reused.
- **Invalidation:** an entry is dropped when the transaction is no longer pending, when scoring inputs change (payee, memo, amount, date, account, import names), or when the ML model zip files change. `refresh=true` discards the cache and rescores the newest batch.
- **No `--force`.** If model zips are missing, fail loud (503) rather than training on a request.
- **Filters after join.** `summary` is counts of the scored working set; `pendingCount` is the full pending table; `items` is the filtered list.

**Stdout contract.** For `predict-json` only: diagnostics go to stderr; stdout is the JSON envelope. The TypeScript parser still extracts the first `{...}` object as defense against `dotnet` CLI banners.

**Schema sharing.** Extract `@budget-tools/db` (Kysely schema + `createDatabase`). Do not copy types into the API and do not import from `apps/transactions-retrieval`.

**Proposal field name.** C# JSON uses `options` (`CategoryOptionDto[]`). `alternatives` is `[JsonIgnore]`. DTOs and later UI plans must use `options`.

## Env contract

Resolved against `process.cwd()` at API startup (the `dev` script already runs from repo root). No `findRepoRoot` in request handlers.

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_CONNECTION_STRING` | (required at runtime) | Shared Postgres |
| `CATEGORIZATION_AI_WORKING_DIR` | `apps/categorization-ai` | Spawn cwd / csproj location |
| `CATEGORIZATION_MODELS_DIR` | `models` | Absolute `ML__*` paths passed to the CLI |
| `CATEGORIZATION_PREDICT_TIMEOUT_MS` | `300000` | Kill the child on timeout |
| `CATEGORIZATION_QUEUE_BATCH_SIZE` | `50` | Pending transactions scored per CLI spawn |
| `CATEGORIZATION_QUEUE_CACHE_DIR` | `apps/api/.cache/categorization-queue` | Persistent local proposal cache |
| `OPENROUTER_API_KEY` | (optional) | Required for `POST /categorization/llm-suggest`; missing key returns 503 |
| `OPENROUTER_MODEL` | `qwen/qwen3.7-flash` | OpenRouter model id for JIT overlays |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible chat completions base URL |

## Endpoints

### `GET /api/categories`

Nested `{ groups: [{ id, name, hidden, categories: [{ id, name, hidden, note }] }] }`. Omit `deleted`; include `hidden`.

### `GET /api/categorization/queue`

Query: `tier?` (comma-separated), `accountId?`, `refresh?`, `expand?`.

The queue is always locally scored (`predict-json` without `--llm`). `llm` on the response is `false`.

Response:

- `summary` — unfiltered scored working-set counts
- `generatedAt` — ISO timestamp of the latest score in that working set
- `llm` — `false` (local scoring)
- `pendingCount` — current pending transactions in Postgres
- `scoredCount` — unfiltered scored working-set size
- `hasMore` — true when pending transactions exist that have not been scored yet
- `items` — `{ transaction, proposal }[]` after filters, sorted AutoApply → Suggested → Review → Blocked, then date descending

### `POST /api/categorization/llm-suggest`

Body: `{ transactionId }`. The transaction must already be in the locally scored working set (404 otherwise).

The handler loads similar finalized household transactions and a nearby assignable-category shortlist, calls OpenRouter (`json_schema`, thinking disabled), resolves the category name against the catalog, and returns an overlay:

- `suggestedCategory` / group / id — catalog-resolved, or null when the model name is unknown
- `confidence` — clamped 0–1
- `notes` — model rationale
- `payeeSuggestion` — present only when local rename is absent and the current payee still looks like the import string
- `model` — the OpenRouter model id used

Overlays are suggestions (`LlmCategorization`); they are never AutoApply. Missing `OPENROUTER_API_KEY` returns 503. The classify **card** is the only UI caller; the queue list and classify table do not request this endpoint.

## Verification

- `pnpm --filter @budget-tools/api tsoa` then `pnpm --filter @budget-tools/web-sdk build`
- `pnpm check`
- Smoke: health, categories against local Postgres, queue first hit (batch spawn), second GET from disk cache, `expand=true` scores the next batch, `refresh=true` rescores the newest batch
