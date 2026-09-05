# Lane research: openrouter-and-mode

Cycle 1 · Wave 1 (Wider) · receipt-taking research  
Bounded lane only. No parent decisions. No architecture recommendation.

## Lane inputs

| Item | Value |
|------|--------|
| Parent artifact (read-only) | `.cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md` |
| Questions owned | Q5 (OpenRouter client), Q4 (Live/Practice gates), Q9 (OCR/image-prep/job queue), plus env/config and API route registration |
| Scope | `apps/api` categorization/llm, operatingMode, ynabSync, env/config, app bootstrap/route registration, package.json deps for image/ocr |
| Non-goals | Classify React overlay details; Amazon date window math |
| Posture | balanced · Limits: none · Research-only |

## Actions taken

1. Read `openRouterClient.ts` + unit tests; traced callers `suggestWithLlm` / `suggestAmazonSplits` / env defaults.
2. Read `operatingMode.ts`, `operatingModeRepo.ts`, `recordDecisions.ts`, `retractDecision.ts`, categorization controller decision routes, web `useLiveClassification` / ClassifyPage live gating.
3. Searched monorepo for OCR/image/canvas/job-queue libraries and usages; scanned workspace `package.json` files under `apps/` and `packages/`.
4. Read `environment.ts`, `server.ts`, `tsoa.json`, sample feature controllers, outbound sync flusher.
5. Confirmed `requireLiveMode` call sites via repo-wide grep.

## Findings

### Q5 — openRouterClient: images, structured JSON, cost, default model

| Claim | Evidence | Confidence |
|-------|----------|------------|
| **Structured JSON: yes.** Shared helper posts OpenAI-compatible chat completions with `response_format.type: 'json_schema'`, `strict: true`, caller-supplied schema name + schema. | `apps/api/src/features/categorization/llm/openRouterClient.ts:106-147` (`completeOpenRouterJson`); also `completeLlmPrediction` wraps it with category schema `81:100` | **high** |
| **Images: not supported by current client.** Message content is plain strings only (`system` / `user: string` on input types). Request body builds `{ role, content: input.system\|user }` — no multimodal array / `image_url` / base64 parts. | Input types `4:25`; messages `142:145` | **high** |
| **usage.cost logging: yes.** Parses OpenRouter `usage.cost` into `costUsd`; logs structured `inference cost` via `logLlmSuggest` including `cost`, `costUsd`, tokens, `generationId`, model. | Parse `193:220`; log `160:170`; `formatUsd` `223:232`; tests `apps/api/src/features/categorization/llm/__tests__/openRouterClient.test.ts:47:64` | **high** |
| **Default model id is `qwen/qwen3.7-flash`.** Env `OPENROUTER_MODEL` defaults to that string; callers pass `OPENROUTER_MODEL` into the client. | `apps/api/src/environment.ts:23`; `suggestWithLlm.ts` / `suggestAmazonSplits.ts` import `OPENROUTER_MODEL` (grep-confirmed) | **high** |
| **Default base URL** `https://openrouter.ai/api/v1`. | `environment.ts:25` | **high** |
| Client disables reasoning (`reasoning: { enabled: false }`) and uses temperature `0.1`. | `openRouterClient.ts:130:133` | **high** |
| Missing API key fails loud at suggest call sites (503), not inside the client itself. | `getOpenRouterApiKey` optional `environment.ts:27:34`; e.g. suggest path throws when empty (caller pattern documented in plans / `suggestWithLlm`) | **high** |

**Gap (Q5):** Whether OpenRouter accepts vision payloads for `qwen/qwen3.7-flash` is an **external** capability claim; this lane only proves the **local client cannot yet send images**. Extending messages to multimodal content would be new code (not present).

### Q4 — operatingMode / requireLiveMode / classification_sync Practice behavior

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Modes are exactly `'practice' \| 'live'`. Seeded default **practice**. | `operatingMode.ts:4:8`; migration insert practice `apps/api/src/data-persistence/migrations/2026-08-27-Operating_Mode.ts:11` (via prior grep); repo `getOperatingMode` `operatingModeRepo.ts:6:16` | **high** |
| `ynabWritesEnabled` / `assertYnabWritesAllowed` / `requireLiveMode`: Practice → HTTP 403 `"YNAB writes are disabled in practice mode"`. | `operatingMode.ts:20:32`; `operatingModeRepo.ts:26:31` | **high** |
| **`requireLiveMode` call sites are only YNAB classification enqueue/retract** — not a global SQLite write gate. | Repo grep: only `recordDecisions.ts:33` and `retractDecision.ts:16` (plus tests) | **high** |
| Live decisions: after live check, rows go to SQLite `classification_sync` via `enqueueClassificationDecision`; request does **not** call YNAB; flush is kicked by count threshold. | `recordDecisions.ts:21:70`; controller copy `categorizationController.ts:102:114` | **high** |
| Practice: `recordDecisions` refuses **before** enqueue; test asserts **no** `classification_sync` row written. | `recordDecisions.test.ts:30:43` | **high** |
| Retract also live-gated. | `retractDecision.ts:13:17`; controller `categorizationController.ts:116:126` | **high** |
| Other SQLite features (travel windows CRUD, amazon orders sync/cache, operating_mode itself) are **not** live-gated. | Controllers lack `requireLiveMode`; grep shows only ynabSync decision paths | **high** |
| Web Classify: Practice does not call decision persist API — `useLiveClassification(mode === 'live')`; when disabled returns `undefined`. Copy says Practice writes nothing to YNAB. | `ClassifyPage.tsx:70`; `useLiveClassification.ts:16:19,72:75`; `operatingModeCopy.ts:5:11` | **high** |
| Background YNAB flusher (`startOutboundSyncFlusher`) does **not** re-check operating mode; it drains whatever is pending in `classification_sync`. Practice safety relies on enqueue being blocked. | `server.ts:100:103`; `startOutboundSyncFlusher.ts:10:24`; `flushOutboundSync.ts:50+` (no `requireLiveMode`) | **med** (flush path read for structure; no explicit live check found) |

**Gap (Q4):** Product intent for **Practice session receipts** (local-only vs no API write) is not implemented; this lane only maps existing Live/Practice gates. Whether receipt extract SQLite should use `requireLiveMode` or a separate rule is a **parent** decision — not decided here.

### Q9 — OCR, sharp, canvas, image-decode, job queue, background worker

| Claim | Evidence | Confidence |
|-------|----------|------------|
| **No OCR / image-prep libraries** in workspace `apps/` + `packages/` `package.json` (no sharp, tesseract, canvas, jimp, pngjs, image-js, jpeg-js, opencv, multer, etc.). | Workspace package.json scan (empty matches); `apps/api/package.json:19:31` deps are sqlite/express/tsoa/env-var/ynab/mcp/talisman only | **high** |
| **No source usages** of decodeImage / createCanvas / tesseract / ocr / deskew / downsample (TS/JS/Python). | Repo grep (no matches) | **high** |
| **No general job-queue library** (bull/bullmq/bee-queue/pg-boss/agenda) in workspace package.json. | Same scan | **high** |
| Closest **in-process background pattern**: outbound YNAB sync flusher — `setInterval` + pending-count threshold trigger; SQLite-backed queue table `classification_sync`. | `startOutboundSyncFlusher.ts:5:24`; started from `server.ts:103` | **high** |
| Amazon orders sync is **request-scoped** MCP work (POST sync), not a durable job queue. | `amazonOrdersController.ts:21:31` | **high** |
| Categorization ML scoring uses cache dir + optional HTTP scorer env — separate from image extract; not an OCR pipeline. | `environment.ts:36:46`; scorer scripts in root `package.json` | **med** (adjacent, not image-related) |

**Gap (Q9):** No candidate local OCR package is selected; external npm evaluation is out of this lane unless parent requests it after confirming the gap.

### Env / config — OPENROUTER_API_KEY and adding vars

| Claim | Evidence | Confidence |
|-------|----------|------------|
| API env is centralized in `apps/api/src/environment.ts` via `env-var`. | File header imports `env from 'env-var'` `1:4`; all OPENROUTER_* there | **high** |
| `OPENROUTER_API_KEY` read lazily via `getOpenRouterApiKey()`; empty → `undefined` (optional for OpenAPI generation). | `environment.ts:27:34` | **high** |
| Related: `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL` as exported constants with defaults. | `23:25` | **high** |
| Repo rule: new env vars go through central typed env/config; never commit `.env*`. | `.cursor/rules/repository-spine.mdc` (Env bullet) | **high** |
| Second env module exists for another app (`apps/transactions-retrieval/src/environment.ts`) — API features should use API module. | Glob of `environment*.ts` | **high** |

**Gap (env):** No receipt-specific env vars exist yet (image storage path, OCR model path, etc.).

### API feature HTTP route registration (receipts controller pattern)

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Routes are **TSOA-generated**, not hand-registered Express routers. | `tsoa.json`; `RegisterRoutes(app)` in `server.ts:14,21` | **high** |
| Controllers live under `apps/api/src/features/**/*Controller.ts` (glob also allows `src/controllers/*Controller.ts`). | `apps/api/tsoa.json:3:4` | **high** |
| Base path `/api`. | `tsoa.json:10:13` | **high** |
| Pattern: class with `@Route('…')`, `@Tags`, method decorators (`@Get`/`@Post`/…), DTOs colocated; `pnpm tsoa` / predev regenerates `src/generated/routes.ts` + OpenAPI. | Examples: `operatingModeController.ts`, `categorizationController.ts`, `amazonOrdersController.ts`, `travelWindowsController.ts`; `apps/api/package.json` scripts `predev`/`tsoa` | **high** |
| App bootstrap: `express.json()`, `RegisterRoutes`, shared error handler, then `getAppDatabase()`, clear LLM cache, `startOutboundSyncFlusher()`, listen. | `server.ts:17:107` | **high** |
| No multipart / file-upload middleware on the Express app today. | `server.ts:17:21` only `express.json()` | **high** |

**Gap (routes):** No receipts controller, DTO, or multipart upload path exists. How binary images would enter (multipart vs base64 JSON) is unimplemented.

## Evidence relationships (question → claim → path:line)

- **Q5** → Client supports constrained JSON schema completions → `openRouterClient.ts:106-147`
- **Q5** → Client does **not** send images (string message content only) → `openRouterClient.ts:4-25`, `142-145`
- **Q5** → Logs `usage.cost` as USD via `parseOpenRouterUsage` + `logLlmSuggest('inference cost', …)` → `openRouterClient.ts:160-170`, `193-220`
- **Q5** → Default model `qwen/qwen3.7-flash` → `environment.ts:23`
- **Q4** → Practice blocks YNAB write enqueue with 403 → `operatingMode.ts:20-32`, `operatingModeRepo.ts:29-31`
- **Q4** → Live gate applies to `classification_sync` enqueue/retract only → `recordDecisions.ts:33`, `retractDecision.ts:16`; Practice writes zero sync rows → `recordDecisions.test.ts:30-43`
- **Q4** → Other SQLite features ungated by Live → travel/amazon controllers (no `requireLiveMode`); grep call-site set
- **Q4** → Web Practice skips decision API → `useLiveClassification.ts:16-19,72-75`, `ClassifyPage.tsx:70`
- **Q9** → No OCR/image/job-queue deps in workspace packages → empty `apps/`+`packages/` package.json scan; `apps/api/package.json:19-31`
- **Q9** → Existing background pattern = in-process YNAB flusher over SQLite queue → `startOutboundSyncFlusher.ts:10-24`, `server.ts:103`
- **Env** → `OPENROUTER_API_KEY` via `getOpenRouterApiKey` in central `environment.ts` → `environment.ts:27-34`
- **Routes** → New feature = TSOA `*Controller.ts` under features glob + `RegisterRoutes` → `tsoa.json:3-13`, `server.ts:21`

## Gaps (named)

1. **Vision payload gap:** Local client cannot attach images; OpenRouter model vision capability not verified in-repo.
2. **Receipt Live/Practice product gap:** Only classification→YNAB path is live-gated; no receipt persistence rules exist.
3. **OCR / image-prep gap:** Zero libraries or code paths in monorepo.
4. **Extract job queue gap:** No durable generic job runner; only YNAB outbound flusher pattern.
5. **Upload ingress gap:** No multipart/binary upload middleware or receipts routes.
6. **Receipt env gap:** No storage/OCR-related env keys yet.

## Stop decision

**Stop.** Lane questions Q4/Q5/Q9 plus env and route-registration patterns have path:line-backed answers at high confidence for in-repo facts. Remaining items are parent product decisions or external package/API verification, outside this bounded lane.
