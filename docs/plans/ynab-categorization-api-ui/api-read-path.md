# Implementation plan: API read path (Phase 1)

Maps to [PRD §6.1–6.2](./PRD.md#61-api--categorization-endpoints) and [PRD §11 Phase 1](./PRD.md#phase-1--read-path).

## Goal

The API can load a review queue of AI proposals joined to local transaction details, and can serve the category catalog for a later picker. When complete:

- `GET /api/categories` returns nested groups from Postgres
- `GET /api/categorization/queue` returns `{ summary, generatedAt, llm, items }` with proposal + transaction per item
- Query filters (`tier`, `accountId`) apply in TypeScript after a cached CLI run — they do not re-spawn
- `pnpm --filter @budget-tools/api tsoa` regenerates OpenAPI; `web-sdk` rebuilds typed hooks
- `pnpm check` still passes

## Out of scope

- Review UI (`ui-review-queue.md`) — keep the disabled Review nav
- Decisions, outbound queue, YNAB PATCH (`api-write-path.md`)
- `GET /api/payees` — no payees table; parked on the write path
- `GET /stats`, `GET /categorization/transactions/{id}`
- Auto-apply, LLM as default

## Design decisions

**CLI is a subprocess, not per-filter.** `predict-json` always scores every pending transaction and is slow. The HTTP layer must not spawn once per filter change.

- **Cache:** in-process, keyed by `llm` boolean. Single-flight so concurrent GETs share one spawn.
- **Refresh:** `refresh=true` forces a new spawn. `llm` overrides server default for that spawn and is part of the cache key.
- **No `--force`.** If model zips are missing, fail loud (503) rather than training on a request.
- **Filters after join.** `summary` is always the full cached queue; `items` is the filtered list.

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
| `CATEGORIZATION_LLM_ENABLED` | `false` | Default for `llm` query param |

## Endpoints

### `GET /api/categories`

Nested `{ groups: [{ id, name, hidden, categories: [{ id, name, hidden, note }] }] }`. Omit `deleted`; include `hidden`.

### `GET /api/categorization/queue`

Query: `tier?` (comma-separated), `accountId?`, `llm?`, `refresh?`.

Response:

- `summary` — unfiltered cache counts
- `generatedAt` — ISO timestamp of the CLI run
- `llm` — whether that run used LLM
- `items` — `{ transaction, proposal }[]` after filters, sorted AutoApply → Suggested → Review → Blocked, then date descending

## Verification

- `pnpm --filter @budget-tools/api tsoa` then `pnpm --filter @budget-tools/web-sdk build`
- `pnpm check`
- Smoke: health, categories against local Postgres, queue first hit (slow), second GET from cache, `refresh=true` re-spawns
