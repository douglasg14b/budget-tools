<!-- markdownlint-disable-file -->
# RPI Phase Details: Receipt taking

## Metadata

* Task ID: RT-20260829
* Task slug: receipt-taking
* Related plan: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md
* Evidence sources: docs/prds/receipt-taking.md; .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md (C1-C40, W1-W3)

## Phase Index

| Phase ID | Name           | Status                   | Detail sections |
|----------|----------------|--------------------------|-----------------|
| P01      | Persist Live receipts | complete | P01-T01 P01-T02 |
| P02      | Receipts HTTP API and SDK | complete | P02-T01 P02-T02 |
| P03      | Dual-direction matcher | complete | P03-T01 P03-T02 |
| P04      | Extract pipeline | complete | P04-T01 P04-T02 |
| P05      | Classify overlay and card capture | complete | P05-T01 P05-T02 |
| P06      | Inbox, search bind, and split drafts | complete | P06-T01 P06-T02 |

### Standing phase-end gate

Before each remaining Pxx git commit (P03–P06): local-review on that phase's source slice; fix Critical, High, and Medium findings and Lows that simplify or improve consistency, quality, or duplication; then build-checker, named tests, and verifier. Do not commit the phase without that review.

<!-- rpi:phase id=P01 -->
## P01: Persist Live receipts

### Context

API SQLite features are created by feature schema, AppDatabase compose, dated migration in MIGRATIONS, and repo via getAppDatabase (C2, C7). SQLITE_DB_PATH defaults to apps/api/data/app.sqlite which is gitignored (C3). There is no image store (C4, C5). requireLiveMode is YNAB-only (C26); other SQLite writes are ungated (C27).

### Intent

Durable Live receipt documents exist as SQLite rows plus files on disk, with a helper that cannot write in Practice.

### Boundaries

* Included: schema, migration, repo, RECEIPTS_DIR, Live write helper, unit tests
* Excluded: HTTP, OCR, matcher, UI

### Likely Targets

* apps/api/src/features/receipts/data/: new schema and repo
* apps/api/src/data-persistence/database.ts: AppDatabase compose
* apps/api/src/data-persistence/migrate.ts: MIGRATIONS
* apps/api/src/data-persistence/migrations/: new dated file
* apps/api/src/environment.ts: RECEIPTS_DIR

### Dependencies

* none

### Validation Expectations

* migrate.test still requires every migrations file in MIGRATIONS
* repo tests use in-memory or temp sqlite plus temp RECEIPTS_DIR
* Live helper writes; non-Live helper throws or no-ops with a typed failure (loud, not silent)

### Completion Evidence

* Tables and files round-trip in tests; Practice path cannot persist

### Unresolved Items

* none

<!-- rpi:task id=P01-T01 -->
### P01-T01: Add receipts schema, migration, and AppDatabase types

#### Context

Copy travelWindows/amazonOrders data layout (C7). Columns: id, created_at, vendor, purchase_date, printed_milliunits, extract_status, extract_json, raw_text, original_path, transaction_id nullable, content_hash for dedupe, totals_disagree integer 0/1. Indexes on purchase_date, printed_milliunits, vendor, transaction_id.

#### Intent

A migrated SQLite shape that can store match keys and a filesystem path, not image bytes.

#### Boundaries

* Included: types, migration up/down, AppDatabase, MIGRATIONS registry
* Excluded: writing files

#### Likely Targets

* apps/api/src/features/receipts/data/receiptsSchema.ts
* apps/api/src/data-persistence/migrations/
* apps/api/src/data-persistence/database.ts
* apps/api/src/data-persistence/migrate.ts

#### Dependencies

* none

#### Validation Expectations

* migrate.test passes
* Typecheck includes new AppDatabase tables

<!-- rpi:task id=P01-T02 -->
### P01-T02: Repo, RECEIPTS_DIR, and Live write helper

#### Context

JSON caches use env dirs (C6). Receipt originals should live under RECEIPTS_DIR defaulting beside the sqlite file under apps/api/data/receipts. Writes must check operating mode (getOperatingMode) rather than requireLiveMode, which is YNAB-specific (C26). Failure must be loud (root-cause rule).

#### Intent

insertOriginal, getById, findByHash, setExtract, setTransactionId, clearTransactionId, deleteReceipt (file plus row) only when Live.

#### Boundaries

* Included: repo plus mode-gated write functions; dedupe by content hash
* Excluded: HTTP; extract pipeline

#### Likely Targets

* apps/api/src/features/receipts/data/receiptsRepo.ts
* apps/api/src/environment.ts
* apps/api/src/features/operatingMode/operatingMode.ts (read only)

#### Dependencies

* P01-T01

#### Validation Expectations

* Temp-dir file plus row tests
* Practice insert is refused
* Dedupe: same bytes do not create a second row

<!-- rpi:phase id=P02 -->
## P02: Receipts HTTP API and SDK

### Context

TSOA controllers under features/**/*Controller.ts, JSON @Body, RegisterRoutes, no multipart (C31, C32, C35). SDK from openapi.generated.json; @summary becomes method names (C36, C40).

### Intent

Browser and Classify can create (data-URL JSON), list, get, fetch original bytes, bind, detach. Writes 403 in Practice.

### Boundaries

* Included: controller, DTOs, Live HTTP gate, image GET, tsoa plus web-sdk regen
* Excluded: extract work inside the request; camera UI

### Likely Targets

* apps/api/src/features/receipts/receiptsController.ts
* apps/api/src/features/receipts/receiptsDtos.ts
* packages/web-sdk/src/gen (generated)

### Dependencies

* P01

### Validation Expectations

* Controller tests or repo-level plus HTTP unit if the repo already tests controllers that way; otherwise DTO plus gate unit tests
* Practice POST 403
* Generated SDK exports receipt methods

### Completion Evidence

* Live create stores file; GET image returns bytes; Practice cannot create

### Unresolved Items

* none

<!-- rpi:task id=P02-T01 -->
### P02-T01: Receipts controller, DTOs, and Live HTTP gate

#### Context

travelWindowsController is the JSON CRUD analog (C35). Image GET can read original_path and send bytes; do not add express.static.

#### Intent

REST surface for Live durability and later matcher/overlay.

#### Boundaries

* Included: POST create with frames array (one receipt, N stills), GET list, GET by id, GET image, POST bind, DELETE bind, DELETE receipt. Create may enqueue pending extract only.
* Excluded: multipart; extract execution (may enqueue pending status only)

#### Likely Targets

* receiptsController.ts, receiptsDtos.ts, environment.ts RECEIPTS_JSON_BODY_LIMIT, server.ts express.json limit

#### Dependencies

* P01-T02

#### Validation Expectations

* Live vs Practice write tests
* Oversize body returns loud 413 from RECEIPTS_JSON_BODY_LIMIT (default 15 MiB) on express.json
* Optional bind on create from Classify card
* Two frames in one POST create one row

<!-- rpi:task id=P02-T02 -->
### P02-T02: Regenerate OpenAPI and web-sdk

#### Context

pnpm tsoa then web-sdk openapi-ts (C36). Method names come from @summary (C40).

#### Intent

Web can call typed receipt APIs.

#### Boundaries

* Included: tsoa spec-and-routes, web-sdk build
* Excluded: UI

#### Likely Targets

* apps/api/generated/openapi.generated.json
* packages/web-sdk/src/gen

#### Dependencies

* P02-T01

#### Validation Expectations

* web-sdk typecheck
* summaries are stable camelCase names

<!-- rpi:phase id=P03 -->
## P03: Dual-direction matcher

### Context

amazonPaymentDateWindow is bank minus 5 through plus 1 (C9). Unique abs milliunits among candidates (C10). matchAmazonPayment is AmazonPaymentRecord-typed (C38). isAmazonTransaction skips Amazon (C11). nameSimilarity exists for fuzzy payee (C15). Fuzzy rule is PRD: similar payee, window, bankAbs greater than printedAbs, tip at most 30 percent of printed; printed 0 excluded.

### Intent

One matcher, two entry points, no Amazon rows, exact unique auto-bind, fuzzy never auto-bind.

### Boundaries

* Included: pure functions plus lookup/bind using stored keys; POST match-preview with ephemeral receipts (no SQLite writes); GET lookup-by-transaction is Live-only SQLite
* Excluded: OCR; OpenRouter; UI; Practice Classify calling Live GET lookup

### Likely Targets

* apps/api/src/features/receipts/matchReceipt.ts (or similar top-level orchestrator)
* receiptsController lookup routes

### Dependencies

* P02

### Validation Expectations

* Unit tests cover exact unique, collision, Amazon skip, fuzzy cap, zero printed, unique amount plus totals_disagree does not auto-bind
* Lookup does not import extract pipeline
* P03-T02 regenerates OpenAPI and web-sdk after lookup and match-preview exist

### Completion Evidence

* Tests green; lookup is indexed fields only

### Unresolved Items

* none

<!-- rpi:task id=P03-T01 -->
### P03-T01: Pure matcher and Amazon skip

#### Context

Do not import matchAmazonPayment or allocateAmazonItemsToBank (C13, C38). receipts/paymentDateWindow.ts must call addIsoDays from amazonOrders/isoDate (generic). Do not duplicate window constants. FUZZY_PAYEE_SIMILARITY_MIN is 0.85.

#### Intent

Deterministic exact and fuzzy ranking.

#### Boundaries

* Included: window, unique amount, payee haystack, Amazon skip, fuzzy rank
* Excluded: HTTP

#### Likely Targets

* apps/api/src/features/receipts/matchReceipts.ts
* apps/api/src/features/receipts/__tests__/matchReceipts.test.ts

#### Dependencies

* P01 schema fields for keys

#### Validation Expectations

* Table-driven tests for the 30 percent cap
* Test title documents FUZZY_PAYEE_SIMILARITY_MIN 0.85
* Unique amount plus totals_disagree is not exact auto-bind; fuzzy/search still allowed
* isAmazonTransaction true never appears in candidate lists
* paymentDateWindow tests share addIsoDays behavior with Amazon minus 5 plus 1

<!-- rpi:task id=P03-T02 -->
### P03-T02: Lookup and bind API wiring

#### Context

PRD 5.5: Classify focus is a cheap SQLite read. Receipt-to-txn and inbox search need Postgres rows in the date window, including already categorized (PRD bind-only, no requeue). Do not use listPendingTransactions (pending-only). Add listTransactionsForReceiptMatch in features/receipts that uses getDatabase, TRANSACTION_DETAIL_COLUMNS, same deleted/cleared/non-transfer filters as listPendingTransactions, plus date window, then filter isAmazonTransaction out. Inbox search reuses transactionMatchesQuery from categorization.

#### Intent

GET lookup-by-transaction (Live SQLite keys) and GET lookup-by-receipt. POST match-preview accepts ephemeral receipt keys plus a transaction id or transaction fields and writes nothing. POST bind Live-only.

#### Boundaries

* Included: lookup routes, match-preview, OpenAPI plus web-sdk regen
* Excluded: starting extract on miss; Practice Classify using Live GET lookup

#### Likely Targets

* receiptsController.ts
* apps/api/src/features/receipts/listTransactionsForReceiptMatch.ts
* packages/web-sdk/src/gen after regen

#### Dependencies

* P03-T01 P02-T01

#### Validation Expectations

* Miss returns quickly with no OpenRouter mock needed
* Bind writes transaction_id only in Live
* Generated SDK includes lookup and match-preview method names
* Amazon transactions never returned from listTransactionsForReceiptMatch

<!-- rpi:phase id=P04 -->
## P04: Extract pipeline

### Context

completeOpenRouterJson is string user content (C34). OpenRouter vision wants text plus image_url data URLs (W1). Default model is already qwen/qwen3.7-flash (C25). No OCR in repo (C29). Background analog is in-process flusher (C30). Amazon vendor extract is dropped (PRD).

### Intent

Background extract that fills keys and lines with gates; never on the Classify hot path.

### Boundaries

* Included: vision client extension; pnpm sharp (downsample, contrast, vertical stitch of frames); pnpm tesseract.js; deskew is an explicit non-goal; arithmetic gate; one repair; enqueue after Live create; POST extract-preview (no files, no SQLite)
* Excluded: frontier primary parser; merchant-specific parsers; bullmq; multipart
* Excluded: frontier primary parser; merchant-specific parsers; bullmq

### Likely Targets

* apps/api/src/features/categorization/llm/openRouterClient.ts
* apps/api/src/features/receipts/pipeline/
* apps/api/package.json via pnpm

### Dependencies

* P02 (pending row and original file)

### Validation Expectations

* Gate unit tests with synthetic lines
* Vision unit test asserts content array shape
* Amazon vendor: delete file plus row and clear transactionId; matcher never sees it
* Lookup module does not import pipeline
* Processed (prep) bytes go to OpenRouter and OCR, not the stored original

### Completion Evidence

* Create Live receipt ends pending then stored gated or ungated or loud fail with dumps
* costUsd logged

### Unresolved Items

* none. Deskew is a non-goal. tesseract.js vs paddle remains a follow-up after gold-set.

<!-- rpi:task id=P04-T01 -->
### P04-T01: Extend OpenRouter client for vision JSON

#### Context

Keep json_schema strict and usage.cost logging (C23, C24). Optional image parts must not break suggestWithLlm.

#### Intent

Header and repair calls share one helper.

#### Boundaries

* Included: OpenRouterJsonInput images optional; messages content array when present (W1)
* Excluded: new API vendors

#### Likely Targets

* openRouterClient.ts and its tests

#### Dependencies

* none besides existing client

#### Validation Expectations

* Existing JSON-schema tests still pass
* New test: body contains image_url data URL when images provided

<!-- rpi:task id=P04-T02 -->
### P04-T02: Local OCR, gate, repair, enqueue

#### Context

PRD extract flowchart. pnpm add sharp and tesseract.js. After Live POST, setImmediate starts extract; response returns pending. POST extract-preview runs the same pipeline in memory and writes nothing (Practice). Amazon vendor: delete file plus row, clear transactionId. Write totals_disagree when header and OCR totals disagree.

#### Intent

Stored extract_status: pending, gated, ungated, failed. Amazon is not a stored status: the row is deleted. totals_disagree is a separate column.

#### Boundaries

* Included: OCR dump, header JSON, gate, one repair, Amazon delete, extract-preview, OpenAPI plus web-sdk regen
* Excluded: Classify calling extract

#### Likely Targets

* receipts/pipeline/*
* server.ts only if a flusher must start; prefer kick from create handler

#### Dependencies

* P04-T01 P01-T02

#### Validation Expectations

* Arithmetic disagree is ungated or failed after repair, never silent gated
* Header/OCR total disagreement sets totals_disagree; matcher does not auto-bind exact
* extract-preview leaves SQLITE_DB_PATH and RECEIPTS_DIR unchanged
* Generated SDK includes extract-preview

<!-- rpi:phase id=P05 -->
## P05: Classify overlay and card capture

### Context

ClassifyWorkspace wires LLM and Amazon hooks (C17). needsLlmSuggest skips Amazon (C16). Receipt skip needs a new condition (C18). Amazon chrome is stage prop plus details panel (C19). No camera today (C20). Practice never GET Live receipt lookup. Practice capture uses extract-preview and match-preview; session receipts are in-memory (C37).

### Intent

Non-Amazon cards cheap-lookup; exact unique ready extract seeds the card and skips generic LLM; camera/file on the card; Amazon unchanged.

### Boundaries

* Included: hook, gates, overlay UI, card capture, Practice session receipts
* Excluded: inbox page (P06)

### Likely Targets

* applyLlmOverlay.ts, ClassifyWorkspace.tsx, ClassifyStage.tsx, new useReceiptOverlay.ts, capture control

### Dependencies

* P03 P04

### Validation Expectations

* applyLlmOverlay tests: Amazon still no LLM; exact unique ready (gated or ungated, not totals_disagree) no LLM; pending exact keeps needsLlmSuggest; failed does not skip LLM; miss still LLM when needsLlmSuggest
* Amazon cards have no capture control
* Practice capture does not call POST create; uses extract-preview
* Practice overlay does not GET Live lookup

### Completion Evidence

* Overlay shows image and extract status like Amazon pending banner
* Filmstrip not blocked when extract pending

### Unresolved Items

* Prefetch key style: prefer Amazon shared keys for receipt lookup so focus and neighbor share cache

<!-- rpi:task id=P05-T01 -->
### P05-T01: Receipt overlay hook and LLM skip

#### Context

Insertion locus ClassifyWorkspace beside existing hooks (C17). Live: GET lookup only, never extract. Practice: match-preview with session receipts only, never GET Live lookup. Ready means extract_status gated or ungated and totals_disagree is false.

#### Intent

Step function A then B then C/D/E/F from the PRD.

#### Boundaries

* Included: selectReceiptPrefetchNeighbors, needsReceiptLookup (not Amazon), apply receipt overlay, needsLlmSuggest extension
* Excluded: camera

#### Likely Targets

* applyLlmOverlay.ts, ClassifyWorkspace.tsx, useReceiptOverlay.ts

#### Dependencies

* P03-T02 SDK lookup

#### Validation Expectations

* Unit tests for needsLlmSuggest: exact ready skip; pending keep LLM; failed keep LLM; miss; Amazon

<!-- rpi:task id=P05-T02 -->
### P05-T02: Card capture, overlay chrome, Practice session

#### Context

getUserMedia still capture plus file input (C20). Permission failure is visible (PRD). One tape is one POST with frames[]. Practice: in-memory receipts; extract-preview then match-preview; refresh clears session binds.

#### Intent

Card door of capture; Live POST with transactionId; overlay chrome copied from Amazon details pattern (C19).

#### Boundaries

* Included: capture UI, session store, overlay panel, pending state
* Excluded: inbox burst

#### Likely Targets

* ClassifyStage.tsx, new ClassifyReceiptContext.tsx, useLiveReceipts analog to useLiveClassification

#### Dependencies

* P05-T01 P02-T02

#### Validation Expectations

* Feature-detect camera; file picker always
* Amazon isAmazonTransaction hides capture
* Two frames one receipt id
* Practice refresh has no leftover binds

<!-- rpi:phase id=P06 -->
## P06: Inbox, search bind, and split drafts

### Context

No /receipts route (C22). Queue at / is not an inbox. Equal-share is PRD; do not use Amazon pro-rata (C13). Agent context when extract exists. Live accept remains classification_sync.

### Intent

Mass capture, unmatched UX (exact fail, close matches, search), honest split drafts.

### Boundaries

* Included: inbox page, search/filter modal or inline, equal-share/gated seed, prompt fields for vendor/date/total/raw/lines gated flag
* Excluded: native apps; AutoApply; reviewer PATCH of extract fields

### Likely Targets

* App.tsx, AppNav.tsx, new receipts inbox components
* Extract DTO includes equal-share or gated split draft from API
* buildLlmPrompt.ts only if receipt context is appended when bound

### Dependencies

* P05

### Validation Expectations

* Inbox works without Classify focus
* Search pick binds Live
* Equal-share remainder on last line; one category no fake split
* Gated amounts used only when they sum to bank milliunits

### Completion Evidence

* PRD AC 2, 4, 5, 9 demonstrable
* Browser verification of inbox plus Classify overlay

### Unresolved Items

* Prompt raw dump truncated if huge; do not drop gated flags. Not a product fork.

<!-- rpi:task id=P06-T01 -->
### P06-T01: Inbox route and transaction search bind

#### Context

New route; nav entry. Reuse matcher APIs. Dedupe on recapture (P01 hash).

#### Intent

Burst capture unbound receipts; match later.

#### Boundaries

* Included: route, capture again, list, close matches, search pick, detach
* Excluded: extract UI beyond status

#### Likely Targets

* apps/web/src/App.tsx, AppNav.tsx, new pages/components under review/receipts

#### Dependencies

* P05-T02 capture control reused if practical

#### Validation Expectations

* Multiple uploads in one sitting
* Amazon transactions never appear in bind search results

<!-- rpi:task id=P06-T02 -->
### P06-T02: Equal-share and gated split seeding plus prompt context

#### Context

C13 is the anti-pattern. Bank amount is source of truth. classification_sync unchanged.

#### Intent

When C (exact unique extract ready), seed split or category without extra LLM. Otherwise existing path plus optional receipt text in LLM prompt when bound but ungated.

#### Boundaries

* Included: equalShareBankMilliunits helper with tests; gated when lines+tax-discounts equal bank; prompt markers gated vs unverified
* Excluded: YNAB PATCH from matcher

#### Likely Targets

* apps/api/src/features/receipts/equalShareBankMilliunits.ts and __tests__/equalShareBankMilliunits.test.ts
* Extract DTO splitDraft field; ClassifyWorkspace seeds from DTO
* buildLlmPrompt.ts only if bound receipt context is appended server-side

#### Dependencies

* P05-T01 extract DTO on overlay

#### Validation Expectations

* Equal-share tests
* Gated vs ungated tests
* Live accept still goes through existing decision persist
