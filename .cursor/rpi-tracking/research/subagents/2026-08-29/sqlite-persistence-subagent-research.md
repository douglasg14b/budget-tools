# Lane research: sqlite-persistence

| Field | Value |
| --- | --- |
| Cycle / wave | 1 / Wider |
| Lane | sqlite-persistence |
| Date | 2026-08-29 |
| Parent artifact | `.cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md` (read-only; not edited) |
| Posture | balanced |
| Output mode | research-only evidence for parent synthesis |
| Limits | none |

## Lane inputs

* Topic: How API SQLite features are created and where receipt rows + original images would live.
* Questions: Q1 (create path: schema, migration, repo, `SQLITE_DB_PATH`); image storage (blob / filesystem-next-to-db / upload / file serving); Q6-related feature `data/` layout (amazonOrders, travelWindows, classification_sync); retention/purge/delete patterns.
* Scope: `apps/api/src/data-persistence`, `apps/api/src/data`, `apps/api/src/features/*/data`, env/config, `migrate.ts`.
* Non-goals: web UI, OpenRouter, Amazon matching logic details; no architecture recommendation; no parent decisions.
* Criteria: `path:line` citations; high/med/low confidence; named gaps.

## Actions taken

1. Listed `apps/api/src/data-persistence/**` and `apps/api/src/features/*/data/**`.
2. Read `migrate.ts`, `database.ts` (SQLite), `runMigrations.ts`, `environment.ts` (`getSqliteDbPath`).
3. Sampled migrations + schemas/repos for amazonOrders, travelWindows, classification_sync, operatingMode, amazonClassify overlays.
4. Grepped for BLOB/image/upload/static serving and for delete/purge/unlink retention patterns.
5. Cross-checked `.gitignore`, `.env.local.example`, docs mentions of `SQLITE_DB_PATH`; noted PRD open questions on image bytes / retention (product intent only).
6. Did not edit application source or the parent research artifact.

---

## Findings

### F1 — API SQLite is a second store, distinct from Postgres

* Claim: YNAB/budget transaction data uses Postgres via `apps/api/src/data/database.ts` (`getDatabase` / `DB_CONNECTION_STRING`). Feature app config and caches use API SQLite via `apps/api/src/data-persistence/database.ts` (`getAppDatabase` / `SQLITE_DB_PATH`).
* Evidence:
  * `apps/api/src/data/database.ts:11-15` — Postgres client from `getDbConnectionString()`.
  * `apps/api/src/data-persistence/database.ts:23-38` — `AppDatabase` composes feature tables; comment that Budget Tools YNAB data stays on Postgres.
  * `apps/api/src/environment.ts:51-59` — `getDbConnectionString` vs `getSqliteDbPath`.
* Confidence: **high**
* Receipt implication (evidence only): PRD already places receipt rows in API SQLite, not Postgres; codebase separation matches that product constraint. No receipt tables exist yet.

### F2 — Q1: Creating a new SQLite feature follows a fixed checklist

* Claim: New API SQLite tables are introduced by (1) feature-local Kysely table types, (2) registering those types on `AppDatabase`, (3) adding a dated migration under `data-persistence/migrations/`, (4) registering the migration in the static `MIGRATIONS` map, (5) implementing a feature repo that calls `getAppDatabase()`, (6) optional CLI/migrate path using the same env path.
* Evidence — schema next to feature:
  * `apps/api/src/features/amazonOrders/data/amazonOrdersSchema.ts:1-39`
  * `apps/api/src/features/travelWindows/data/travelWindowsSchema.ts:5-20`
  * `apps/api/src/features/ynabSync/data/classificationSyncSchema.ts:1-14`
  * `apps/api/src/features/operatingMode/data/operatingModeSchema.ts:3-6`
* Evidence — composition:
  * `apps/api/src/data-persistence/database.ts:8-38` — imports feature schema types into `AppDatabase`.
* Evidence — migration files (`up`/`down`, Kysely schema builder, snake_case columns):
  * `apps/api/src/data-persistence/migrations/2026-08-25-Amazon_Order_Tables.ts:4-64`
  * `apps/api/src/data-persistence/migrations/2026-08-28-Classification_Sync.ts:4-20`
  * `apps/api/src/data-persistence/migrations/2026-08-23-Create_Travel_Tables.ts:4-28`
  * `apps/api/src/data-persistence/migrations/2026-08-27-Operating_Mode.ts:4-12`
* Evidence — explicit registry (no dynamic FS import; Windows path-safe):
  * `apps/api/src/data-persistence/migrate.ts:12-24` — `MIGRATIONS` record; comment to add each new file.
  * `apps/api/src/data-persistence/migrate.ts:32-48` — `migrateToLatest` via Kysely `Migrator`.
  * `apps/api/src/data-persistence/__tests__/migrate.test.ts:10-17` — every file in `migrations/` must appear in `MIGRATIONS`.
* Evidence — open + migrate:
  * `apps/api/src/data-persistence/database.ts:44-65` — `createAppDatabase` (mkdir parent dir; better-sqlite3 + plugins).
  * `apps/api/src/data-persistence/database.ts:70-80` — `getAppDatabase` lazily opens `getSqliteDbPath()` and runs `migrateToLatest`.
  * `apps/api/src/server.ts:100-101` — API start awaits `getAppDatabase()`.
  * `apps/api/src/data-persistence/runMigrations.ts:5-14` — CLI migrate entry.
  * `apps/api/package.json:9` — `"migrate"` script runs `runMigrations.ts` under dotenvx.
* Evidence — env path:
  * `apps/api/src/environment.ts:55-59` — `SQLITE_DB_PATH` default `apps/api/data/app.sqlite`, resolved via `resolveFromCwd`.
  * `.env.local.example:3` — documents `SQLITE_DB_PATH=apps/api/data/app.sqlite`.
  * `.gitignore:135` — `apps/api/data/` ignored (local DB not committed).
* Confidence: **high**

### F3 — Column / payload conventions in existing SQLite tables

* Claim: Tables use `text` / `integer` columns; structured payloads are stored as **JSON text**, not SQLite `BLOB`. Booleans are `integer` 0/1 with `SqliteBindingPlugin`; some dates are ISO `text` (or `SqlDatePlugin` for travel window timestamps).
* Evidence:
  * Amazon `raw_json` text columns: `.../2026-08-25-Amazon_Order_Tables.ts:15`, `:32`, `:44`.
  * Classification `decision_json` text: `.../2026-08-28-Classification_Sync.ts:8`.
  * Overlay `overlay_json` text: `.../2026-08-26-Amazon_Split_Overlays.ts:8`.
  * Binding plugins: `apps/api/src/data-persistence/database.ts:54-63`; `apps/api/src/data-persistence/plugins/sqliteBindingPlugin.ts:21-24`.
* Confidence: **high** for “no BLOB columns today”; **medium** that JSON-text is the preferred large-payload pattern (strong precedent, not a written rule).

### F4 — Image / binary storage: no existing API pattern for receipt originals

* Claim: There is **no** existing SQLite BLOB column, filesystem-next-to-db image store, multipart upload handler, or static file-serving route in `apps/api` for user images. Closest filesystem persistence is **JSON cache files** under env-configured dirs (categorization queue / LLM overlays), not binary originals.
* Evidence — absence of blob/image columns:
  * Grep of `apps/api/src` for `BLOB` / image path columns: only test string `FEATURE_BLOB` in categorization LLM tests (`apps/api/src/features/categorization/llm/__tests__/buildLlmPrompt.test.ts:53`, `:182`) — not storage.
  * All current `AppDatabase` tables listed in `database.ts:27-38` are text/integer domain tables.
* Evidence — no upload / static serving:
  * Grep for `multer`, `multipart`, `express.static`, `sendFile`, `createReadStream` under `apps/api/src`: no matches.
* Evidence — adjacent filesystem persistence (JSON caches, not images):
  * `apps/api/src/environment.ts:36-38` — `CATEGORIZATION_QUEUE_CACHE_DIR` default `apps/api/.cache/categorization-queue`.
  * `apps/api/src/features/categorization/cache/proposalCache.ts:1-3`, `:35-37`, `:42-45` — `readFile`/`writeFile` JSON caches.
  * `apps/api/src/features/categorization/llm/overlayCache.ts:1` — same fs/promises pattern; cleared on API start (`apps/api/src/server.ts:102`).
  * `.gitignore:83`, `:95`, `:105` — `.cache` ignored.
* Evidence — DB file parent dir is created, not an image sibling convention:
  * `apps/api/src/data-persistence/database.ts:45-47` — `mkdirSync(dirname(filePath))` for the SQLite file only.
* Evidence — product leaves bytes location open (not codebase precedent):
  * `docs/prds/receipt-taking.md:246` — open question: filesystem next to SQLite vs blob column.
* Confidence: **high** that no image storage/serving exists; **high** that JSON-on-disk caches are the only durable non-SQLite file pattern in API; **n/a** for choosing blob vs files (parent/product).

### F5 — Q6-related: feature `data/` module layout (copyable patterns)

* Claim: SQLite-backed features colocate under `apps/api/src/features/<feature>/data/` with `*Schema.ts` (Kysely table types) + `*Repo.ts` (persistence only; optional `db?: AppDatabaseClient` for tests) + colocated `__tests__/`. Feature logic outside `data/` calls the repo. Three strong exemplars:
  1. **amazonOrders** — multi-table cache + upsert/onConflict + bulk clear.
  2. **travelWindows** — CRUD + child rows + transactional delete.
  3. **ynabSync / classification_sync** — status machine + targeted deletes + reconcile cleanup.
* Evidence — layout files:
  * `apps/api/src/features/amazonOrders/data/amazonOrdersSchema.ts`, `amazonOrdersRepo.ts`
  * `apps/api/src/features/travelWindows/data/travelWindowsSchema.ts`, `travelWindowsRepo.ts`
  * `apps/api/src/features/ynabSync/data/classificationSyncSchema.ts`, `classificationSyncRepo.ts`, `classificationSyncRow.ts`
  * Also: `operatingMode/data/*`, `amazonClassify/data/amazonSplitOverlay*` (overlay table owned by classify feature).
* Evidence — repo defaults to `getAppDatabase()`:
  * `amazonOrdersRepo.ts:2`, `:45`
  * `travelWindowsRepo.ts:2`, `:97`
  * `classificationSyncRepo.ts:2`, `:146`
* Evidence — tests open in-memory/temp DB and call `migrateToLatest`:
  * e.g. `apps/api/src/features/travelWindows/data/__tests__/travelWindowsRepo.test.ts:9`, `:25-30`
* Confidence: **high** for layout pattern; parent still owns which exemplar receipts should mirror (document store vs cache vs sync queue).

### F6 — Retention / purge / delete patterns

* Claim: There is **no** time-based retention, TTL column, or scheduled purge for SQLite rows or durable files. Deletes are **explicit, feature-driven**: user/API delete, replace-child-rows, reconcile cleanup, or CLI cache clear. Ephemeral JSON caches may be unlinked.
* Evidence — row deletes:
  * Travel window delete (children then parent): `travelWindowsRepo.ts:96-102`.
  * Replace accounts: `travelWindowsRepo.ts:152`.
  * Amazon order item replace-on-upsert: `amazonOrdersRepo.ts:105`.
  * Bulk Amazon order/item clear: `amazonOrdersRepo.ts:210-218`.
  * CLI clear script (orders + overlays, keeps payments): `clearAmazonOrderCache.ts:7-20`.
  * Overlay deletes: `amazonSplitOverlayRepo.ts:22-47`.
  * Classification retract: `classificationSyncRepo.ts:142-157`.
  * Classification confirmed-present purge: `classificationSyncRepo.ts:288-310`.
* Evidence — file unlink (caches only):
  * `proposalCache.ts:90-101` — unlink cache/temp on write paths.
  * `overlayCache.ts:50` — unlink overlay cache file.
  * Server clears LLM overlay cache at start: `server.ts:102`.
* Evidence — PRD retention still open:
  * `docs/prds/receipt-taking.md:242`, `:247` — retention days / forever vs delete control are open questions.
* Confidence: **high** that no retention scheduler exists; **high** that explicit `deleteFrom` + optional CLI clear is the established pattern.

### F7 — “Invoice” naming is Amazon scrape text, not image receipts

* Claim: `fetchAmazonOrderInvoices` and related code fetch/parse Amazon order invoice **structured data** into SQLite text columns; they are not a pattern for storing photographed receipt images.
* Evidence: `apps/api/src/features/amazonOrders/fetchAmazonOrderInvoices.ts:12` (doc comment: print-invoice details); order tables store `raw_json` text (`2026-08-25-Amazon_Order_Tables.ts`).
* Confidence: **high**

---

## Question → claim map (for parent lift)

| Q | Claim (short) | Primary `path:line` | Conf. |
| --- | --- | --- | --- |
| Q1 | Feature tables: schema in `features/*/data`, compose `AppDatabase`, migration file + `MIGRATIONS`, repo via `getAppDatabase` | `database.ts:23-38`; `migrate.ts:17-24`; `database.ts:70-80` | high |
| Q1 | Env path `SQLITE_DB_PATH` → `getSqliteDbPath()`, default `apps/api/data/app.sqlite`, cwd-resolved; `apps/api/data/` gitignored | `environment.ts:55-59`; `.gitignore:135` | high |
| Q1 | Migrate on lazy open and via `pnpm` migrate → `runMigrations.ts` | `database.ts:77-80`; `runMigrations.ts:5-14` | high |
| Image | No SQLite BLOB / image columns; large payloads are JSON **text** | e.g. `2026-08-25-Amazon_Order_Tables.ts:15`; `AppDatabase` `database.ts:27-38` | high |
| Image | No multipart upload or static file serving in API | grep: no matches in `apps/api/src` | high |
| Image | Only durable non-SQLite files today: categorization JSON caches under env dir | `environment.ts:36-38`; `proposalCache.ts:35-45` | high |
| Image | Product open: blob vs filesystem-next-to-SQLite | `docs/prds/receipt-taking.md:246` | high (open) |
| Q6 layout | Copy `features/<name>/data/{*Schema,*Repo}.ts` (+ `__tests__`); exemplars amazonOrders / travelWindows / classification_sync | paths under `features/*/data/` listed in F5 | high |
| Retention | No TTL/scheduled purge; explicit `deleteFrom` / CLI clear / cache unlink | `travelWindowsRepo.ts:96-102`; `clearAmazonOrderCache.ts:7-20`; `classificationSyncRepo.ts:288-310` | high |
| Retention | Receipt retention policy not decided in product | `docs/prds/receipt-taking.md:247` | high (open) |

---

## Gaps (named)

| ID | Gap | Why it matters | Blocking for this lane? |
| --- | --- | --- | --- |
| G-SP-1 | No receipt feature / tables / migrations exist | Parent cannot cite a receipt schema; only creation pattern | No — pattern is clear |
| G-SP-2 | No codebase precedent for binary image bytes (BLOB vs files next to DB) | PRD requires Live durable originals; location is product-open | Yes for planning storage shape; **out of lane to decide** |
| G-SP-3 | No API upload / file-serve convention | Capture/replay HTTP surface has no sibling to copy | Adjacent (wiring lane); noted |
| G-SP-4 | No retention/purge policy or job for durable blobs/files | PRD open; existing deletes are manual/feature-scoped | Yes for planning lifecycle; **out of lane to decide** |
| G-SP-5 | Unclear whether processed/prep images would share storage with originals | PRD distinguishes original vs processed (`receipt-taking.md:116`) | Parent/product |
| G-SP-6 | Which exemplar repo shape receipts should copy (document CRUD vs upsert cache vs sync status) | Affects delete/reconcile design | Parent synthesis |

---

## Alternatives observed (not selected)

* **JSON text in SQLite** for structured payloads (established) vs **BLOB** for images (unused).
* **Filesystem JSON caches** with env path (categorization) vs **SQLite rows** for durable feature state (travel, Amazon, sync, mode).
* **Postgres** (`apps/api/src/data`) explicitly not used for API feature tables / PRD receipt blobs.

Lane does **not** recommend which alternative receipts should use.

---

## Stop decision

* **Stop this Wider lane:** yes.
* **Rationale:** Q1 creation path, env path, module layout, delete/purge precedents, and image-storage **absence** are evidence-backed under balanced posture. Remaining items (blob vs files, retention days, processed-image location, which exemplar to copy) are product/parent decisions or other lanes — further codebase search in this scope is redundant.
* **Not done by this worker:** deeper wave detail, contrarian wave, parent evidence-state classification, architecture recommendation.
