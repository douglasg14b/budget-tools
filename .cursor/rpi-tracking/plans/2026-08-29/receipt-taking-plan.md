<!-- markdownlint-disable-file -->
# RPI Plan: Receipt taking

## Task Metadata

* Task ID: RT-20260829
* Task slug: receipt-taking
* Planning status: ready
* Plan date: 2026-08-29
* Phase details: .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md
* Plan critique: .cursor/rpi-tracking/reviews/plans/2026-08-29/receipt-taking-plan-critique.md

## Executive Summary

Receipt taking adds in-app capture, Live-durable originals and extract in API SQLite, and a dual-direction matcher so Classify can reuse stored split context without waiting on OCR. Amazon payees stay on amazon-suggest. Practice never writes receipt rows or files; it uses extract-preview and match-preview APIs plus in-memory session receipts so the matcher still runs. The plan extends existing SQLite, TSOA, OpenRouter JSON, and Classify overlay recipes, and adds a Live write gate, filesystem originals, vision content parts, sharp prep, and tesseract.js because those have no in-repo sibling.

### User Decisions and Requirements Highlights

* Capture on the Classify card and in a mass inbox; Live persists, Practice is session-only.
* Amazon cards never enter receipt lookup or capture; amazon-suggest always wins.
* Extract is prep plus cheap vision headers plus local boxed OCR plus an arithmetic gate plus one repair, not a frontier model as the parser.
* Exact unique auto-bind; fuzzy tips (bank greater than printed, at most 30 percent of printed) never auto-bind.
* Each remaining Pxx (P03–P06) runs local-review on that phase slice and, before the phase git commit, fixes Critical, High, and Medium findings plus Lows that simplify or improve consistency, quality, or duplication.

### What You May Not Know

* requireLiveMode only gates YNAB classification_sync. Copying travel-windows SQLite writes would persist Practice receipts. Receipt APIs need their own Live gate.
* matchAmazonPayment is Amazon order-typed. Receipts get a tiny generic window plus unique-amount helper.
* allocateAmazonItemsToBank is weighted pro-rata. Ungated receipt splits must equal-share the bank amount.

### Unresolved Decisions or Blockers

* None blocking. Critique High findings applied (PC-001–PC-005 and planner Medium/Low). HTTPS/LAN for a physical phone camera remains ops follow-up. Reviewer extract-field edit is follow-up, not this milestone.

For current user input, see [User Decisions and Requirements](#user-decisions-and-requirements). The planner keeps the synthesized sections below current as evidence and user direction evolve.

## User Decisions and Requirements

* Build the current milestone in docs/prds/receipt-taking.md via RPI (caller 2026-08-29).
* Two capture doors: Classify card attach and mass inbox, one receipt type.
* Live: durable original plus SQLite extract plus optional transactionId. Practice: session only, including capture. Practice still runs extract and match via write-free preview APIs; Classify in Practice never GET-looks-up Live SQLite receipts.
* Receipts stay in API SQLite; Postgres transactions are unchanged. No receipt blobs in Postgres.
* Amazon payees and Amazon paper receipts are out. isAmazonTransaction skips lookup, capture, and matcher candidates. amazon-suggest always wins.
* Match keys: vendor, date, printed total milliunits. Shared date window is bank date minus 5 through plus 1. Exact unique auto-binds; collisions stay unbound.
* Fuzzy close matches: similar payee, same window, bank abs greater than printed abs, tip at most 30 percent of printed; never auto-bind. Then search/filter pick.
* Extract: store original; prep (crop/deskew/contrast/stitch/downsample); cheap OpenRouter vision JSON for vendor/date/total using existing OPENROUTER_API_KEY (default qwen/qwen3.7-flash); local boxed OCR for lines; arithmetic gate; one vision repair on gate fail. Loud failure, dumps kept.
* Classify step function: Amazon first; else cheap SQLite lookup; exact unique plus extract ready reuses stored split and skips generic llm-suggest; miss does not start OCR/OpenRouter.
* Ungated names: equal shares of the bank milliunits (remainder on last). Gated lines may own cents only when math matches the bank. Live accept still uses classification_sync. No AutoApply.
* Already categorized non-Amazon charges may exact-bind; they are not re-queued.
* Reviewer can detach a bind and must confirm Live category/split. Editing stored vendor/date/total/lines is follow-up (not in section 9 ACs).
* Leftover PRD open questions resolved for this plan from research: filesystem originals under gitignored data/; keep until explicit delete; HTTPS/phone is ops not a v1 product phase.
* Before closing each Pxx Fettra gate set, run the local-review skill on that phase's working-tree slice. Before the phase git commit, fix Critical, High, and Medium findings, and Lows that simplify or improve consistency, quality, or duplication (caller 2026-08-30). Then build-checker, named tests, and verifier. Do not mark the phase complete until that sequence has run.

## Goals

* G1 Capture stills and existing files in the web app on Classify (non-Amazon) and in a receipt inbox.
* G2 Live originals and extract survive API restart; Practice does not persist receipts.
* G3 Dual-direction matching with exact unique auto-bind, fuzzy options, then search; Amazon excluded.
* G4 Best-effort line items with loud ungated status; arithmetic gate owns cents or equal-share drafts.
* G5 Classify stays snappy: Amazon never looks up receipts; other cards do a cheap indexed read; miss follows today's LLM path.
* G6 No silent bad data: no auto-match on disagreement or collision; no ungated milliunits to YNAB; no silent fuzzy bind.

## Scope and Non-Goals

### In Scope

* API receipts feature: schema, migration, repo, filesystem originals, TSOA JSON APIs, Live write gate, matcher, extract pipeline, image GET.
* Web: Classify overlay/hook, card camera and file picker, inbox route, Practice session store, search/filter bind, split seeding from extract.
* OpenRouter vision extension on the existing client; tesseract.js local OCR; in-process extract after Live capture.
* web-sdk regeneration from TSOA OpenAPI.

### Non-Goals

* Native iOS/Android apps.
* Amazon paper receipts or overlays; replacing amazon-suggest or Playwright scrape.
* Store-account digital receipts as the v1 path.
* AutoApply / YNAB write without Classify accept.
* Postgres receipt storage.
* Multipart upload, SQLite BLOB, bullmq, Vite HTTPS/LAN bind, retention purge UI.
* Perfect supermarket OCR as launch bar.

## Functional Requirements

* Capture one or more stills or a file from a focused non-Amazon Classify card; Live binds that transactionId; Practice stays in session.
  * Observable acceptance criteria: PRD AC 1; Amazon cards offer no capture.
* Inbox captures or uploads multiple receipts without a focused transaction.
  * Observable acceptance criteria: PRD AC 2.
* Exact unique pair (window plus unique milliunits plus payee) auto-binds; Live persists; Practice does not; duplicate amounts stay unbound.
  * Observable acceptance criteria: PRD AC 3.
* Exact miss shows close matches under the 30 percent tip rule; pick binds; fuzzy never auto-binds; then search/filter.
  * Observable acceptance criteria: PRD AC 4-5.
* Amazon queue items skip receipt lookup. Other items cheap-lookup before llm-suggest; ready extract skips generic LLM; miss does not wait on OCR.
  * Observable acceptance criteria: PRD AC 6.
* Vendor/date/total appear on extract success; failure is visible and does not fabricate fields. Header vs OCR total disagreement blocks exact auto-bind.
  * Observable acceptance criteria: PRD AC 7-8.
* Ungated drafts equal-share the bank amount; gated drafts use reconciled line amounts; Live accept uses classification_sync.
  * Observable acceptance criteria: PRD AC 9.
* Live restart serves originals and extract; Practice refresh has no leftover binds.
  * Observable acceptance criteria: PRD AC 10.
* Extract preprocesses, fills headers via cheap vision JSON, fills lines via local boxed OCR, repairs once on arithmetic failure; ungated prices never become split milliunits.
  * Observable acceptance criteria: PRD AC 11.

## Non-Functional Requirements

* Lookup is an indexed SQLite read with no OCR, vision, or OpenRouter on the miss path.
  * Objective threshold or evaluation condition: Classify miss latency matches today's non-Amazon path aside from that read.
  * Operating condition or verification approach, if needed: unit plus overlay-enablement tests; no extract call in lookup.
  * Observable acceptance criteria: PRD G7 / NFR lookup.
* Typical extract uses cheap header VLM plus local OCR; repair is rare; log usage.cost.
  * Objective threshold or evaluation condition: well under $0.01 per receipt on the recommended path (PRD).
  * Operating condition or verification approach, if needed: log costUsd like classify.
  * Observable acceptance criteria: NFR extract cost.
* Live originals and SQLite rows survive API restart.
  * Objective threshold or evaluation condition: GET by id after process restart in Live.
  * Operating condition or verification approach, if needed: repo tests plus documented data dir.
  * Observable acceptance criteria: PRD AC 10.
* Invalid extract and camera permission failure are loud, not silent success.
  * Objective threshold or evaluation condition: stored extract status and UI error.
  * Operating condition or verification approach, if needed: status enum tests.
  * Observable acceptance criteria: PRD 5.7.

## Acceptance Criteria

* All Current milestone items in docs/prds/receipt-taking.md section 9 (items 1-11).
* Amazon cards never run receipt lookup or capture.
* Practice writes no receipt files, SQLite rows, or transactionId.
* Fettra quality gates per completed Pxx, **in this order, before the phase git commit**: local-review on the phase slice (Critical, High, and Medium fixed; Lows fixed when they simplify or improve consistency, quality, or duplication), then build-checker, then tests named below, then verifier. No Pxx source commit without that local-review.

## Implementation Context Record

| Context item                     | Current artifact or record                                                                                                               |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Plan                             | .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md                                                                             |
| Phase details                    | .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md                                                                  |
| Latest critique                  | .cursor/rpi-tracking/reviews/plans/2026-08-29/receipt-taking-plan-critique.md Revise applied by planner; no second critique |
| Relevant research                | .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md                                                                                          |
| Changes-record role              | .cursor/rpi-tracking/changes/2026-08-29/receipt-taking-changes.md is created or continued by implementation as its evidence record       |
| Planning execution and readiness | Ready after planner revision of PC-001–PC-014 |
| Continuation context             | standalone @rpi-implement; declared scope P06 complete; remaining active-plan markers none; caller testing inbox + Classify overlay |

## Sources

* docs/prds/receipt-taking.md: product intent and acceptance; cite, do not copy.
* .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md: C1-C40, W1-W3, selected recommendation.
* docs/plans/ynab-categorization-api-ui/api-write-path.md: Live vs Practice YNAB path.
* docs/amazon-classify-sync.md: date window analog.

## Phase Checklist

<!-- rpi:phase id=P01 -->
### [x] P01: Persist Live receipts

* Intent: SQLite receipt rows, filesystem originals, env, and a Live-only write helper exist and are tested without HTTP.
* Dependencies: none

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Add receipts schema, migration, and AppDatabase types

* Requirement and evidence: PRD 5.2; research C2 C7
* Expected result: migrate.test includes the new file; AppDatabase has receipts tables; columns include totals_disagree; indexes on purchase_date, printed_milliunits, vendor, transaction_id
* Detail section: P01-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P01-T02 -->
#### [x] P01-T02: Repo, RECEIPTS_DIR, and Live write helper

* Requirement and evidence: PRD Live vs Practice; research C3 C6 C26 C27
* Expected result: repo tests on temp dir; writes refused unless Live; Practice cannot insert via the helper
* Detail section: P01-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:phase id=P02 -->
### [x] P02: Receipts HTTP API and SDK

* Intent: TSOA JSON create/list/get/image/bind/detach plus documented JSON body limit; Live gate on writes; first web-sdk regen for those routes.
* Dependencies: P01

<!-- rpi:task id=P02-T01 -->
#### [x] P02-T01: Receipts controller, DTOs, and Live HTTP gate

* Requirement and evidence: PRD 5.2 5.4; research C31 C32 C35 C26
* Expected result: Practice POST create returns 403; Live POST stores file plus row; GET image serves original; oversize data-URL returns a loud typed 413 from RECEIPTS_JSON_BODY_LIMIT
* Detail section: P02-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P02-T02 -->
#### [x] P02-T02: Regenerate OpenAPI and web-sdk

* Requirement and evidence: research C36 C40
* Expected result: generated client has named receipt methods from TSOA summaries
* Detail section: P02-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:phase id=P03 -->
### [x] P03: Dual-direction matcher

* Intent: Generic window plus unique-amount plus payee exact tier; fuzzy 30 percent tip; Amazon excluded; indexed lookup and match-preview endpoints; second web-sdk regen.
* Dependencies: P02

<!-- rpi:task id=P03-T01 -->
#### [x] P03-T01: Pure matcher and Amazon skip

* Requirement and evidence: PRD 5.4; research C9 C10 C11 C14 C38 C15
* Expected result: unit tests for exact unique, collision, Amazon skip, fuzzy cap, printed zero excluded, unique amount plus totals_disagree does not auto-bind (fuzzy still allowed)
* Detail section: P03-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P03-T02 -->
#### [x] P03-T02: Lookup and bind API wiring

* Requirement and evidence: PRD 5.5 indexed lookup
* Expected result: GET lookup-by-transaction (Live SQLite keys only) and GET lookup-by-receipt; POST match-preview accepts ephemeral receipts and writes nothing; OpenAPI plus web-sdk regen includes those methods
* Detail section: P03-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:phase id=P04 -->
### [x] P04: Extract pipeline

* Intent: Prep with sharp (downsample, contrast, stitch frames; deskew non-goal), cheap vision headers, local OCR lines, arithmetic gate, one repair, in-process after Live create; extract-preview for Practice; Classify never calls extract.
* Dependencies: P02

<!-- rpi:task id=P04-T01 -->
#### [x] P04-T01: Extend OpenRouter client for vision JSON

* Requirement and evidence: PRD 5.3; research C23 C34 W1
* Expected result: completeOpenRouterJson accepts image data URLs; existing text callers still work; cost logged
* Detail section: P04-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P04-T02 -->
#### [x] P04-T02: Local OCR, gate, repair, enqueue

* Requirement and evidence: PRD 5.3 AC 11; research C29 C30 W3
* Expected result: pnpm sharp and tesseract.js; processed bytes go to OpenRouter/OCR not originals; Amazon vendor deletes file plus row and clears transactionId; gate fail then one repair; totals_disagree stored; POST extract-preview writes nothing; OpenAPI plus web-sdk regen; lookup path has no extract import
* Detail section: P04-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:phase id=P05 -->
### [x] P05: Classify overlay and card capture

* Intent: Cheap receipt hook in ClassifyWorkspace; skip llm-suggest on exact unique ready extract; Amazon unchanged; card camera/upload for non-Amazon.
* Dependencies: P03 P04

<!-- rpi:task id=P05-T01 -->
#### [x] P05-T01: Receipt overlay hook and LLM skip

* Requirement and evidence: PRD 5.5; research C16 C17 C18 C19
* Expected result: needsLlmSuggest false only on exact unique plus extract ready (gated or ungated, not totals_disagree, not pending, not failed); Amazon still skips receipts; Practice uses match-preview plus session receipts and never GET Live lookup; tests for ready, pending, failed, Amazon
* Detail section: P05-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P05-T02 -->
#### [x] P05-T02: Card capture, overlay chrome, Practice session

* Requirement and evidence: PRD 5.1 G1; research C20 C28 C37
* Expected result: camera/file on non-Amazon cards; one POST with all frames of one tape; Practice does not call write APIs; Practice extract uses extract-preview; pending extract does not block filmstrip
* Detail section: P05-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:phase id=P06 -->
### [x] P06: Inbox, search bind, and split drafts

* Intent: /receipts inbox burst capture; search/filter bind; equal-share or gated split seed; agent prompt context.
* Dependencies: P05

<!-- rpi:task id=P06-T01 -->
#### [x] P06-T01: Inbox route and transaction search bind

* Requirement and evidence: PRD 5.1 5.4 AC 2 5; research C22
* Expected result: capture without a focused txn; close matches plus search pick; detach works in Live
* Detail section: P06-T01 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

<!-- rpi:task id=P06-T02 -->
#### [x] P06-T02: Equal-share and gated split seeding plus prompt context

* Requirement and evidence: PRD 5.6; research C13
* Expected result: ungated equal bank shares from API helper on the extract DTO; gated uses line amounts only when they sum to bank; Live accept still classification_sync; do not call allocateAmazonItemsToBank
* Detail section: P06-T02 in .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md

## Dependencies

* P01 before P02: HTTP writes the repo.
* P02 before P03 and P04: matcher and extract need rows and image bytes.
* P03-T02 regenerates web-sdk after lookup and match-preview routes exist; P05-T01 depends on those generated methods.
* P04-T02 regenerates web-sdk after extract-preview exists.
* P03 and P04 before P05: overlay reads lookup (Live) or previews (Practice) and extract status.
* P05 before P06: inbox reuses capture and overlay pieces.
* OpenRouter key already required for classify; receipts reuse it.
* pnpm add sharp and tesseract.js only in P04 (package-json-deps.mdc).

## Test ownership (locked for critique)

* API unit: apps/api/src/features/receipts/**/__tests__ for repo, matcher, gate, Live helper, Amazon drop, equal-share (equalShareBankMilliunits lives in this tree).
* OpenRouter: extend apps/api/src/features/categorization/llm/__tests__/openRouterClient.test.ts for vision payload without breaking JSON-schema tests.
* Web: apps/web/src/components/review/classify/__tests__ for needsLlmSuggest receipt skip, Amazon still skip, overlay enablement.
* Exact removals: none
* Maximum new production files: prefer one receipts feature tree plus classify overlay files; do not add a second persistence stack.
* Semantic coverage over snapshot UI; no requirement for browser E2E in this plan (verify in implement via available browser tools for P05/P06).
* Integration: none beyond existing migrate.test registry check.

## Critique Disposition

| Critique run and finding | Disposition | Plan response or residual risk |
|--------------------------|-------------|--------------------------------|
| PC-001 Practice match/extract | resolved | Practice extract-preview and match-preview write nothing; Classify Practice never GET Live lookup |
| PC-002 SDK regen before lookup | resolved | P03-T02 and P04-T02 each regen after their routes |
| PC-003 totals disagreement | resolved | totals_disagree on row; P03 test unique plus disagree does not auto-bind |
| PC-004 JSON body limit | resolved | RECEIPTS_JSON_BODY_LIMIT in P02-T01; loud 413 |
| PC-005 prep dependency | resolved | pnpm sharp for downsample, contrast, stitch; deskew non-goal |
| PC-006 Postgres search | resolved | receipts listTransactionsForReceiptMatch via getDatabase plus TRANSACTION_DETAIL_COLUMNS; search reuses transactionMatchesQuery; not pending-only |
| PC-007 equal-share home | resolved | API receipts helper plus tests; web seeds from DTO |
| PC-008 Amazon drop | resolved | delete file plus row; clear transactionId |
| PC-009 extract ready | resolved | ready = gated or ungated and not totals_disagree; pending/failed do not skip LLM |
| PC-010 multi-frame | resolved | one POST frames array; server stitches; two frames one row |
| PC-011 reviewer edit | resolved | dropped from this milestone; follow-up item |
| PC-012 fuzzy cutoff | resolved | FUZZY_PAYEE_SIMILARITY_MIN 0.85 matching looksLikeImportName RAW threshold |
| PC-013 date window | resolved | receipts paymentDateWindow using addIsoDays from amazonOrders/isoDate; do not copy-paste; do not import matchAmazonPayment |
| PC-014 vendor index | resolved | P01-T01 indexes vendor |

## Follow-Up Items

* Vite host:true / HTTPS so a physical phone can hit the local API (research C21). Outside v1 product phases.
* OCR A/B tesseract.js vs ppu-paddle-ocr after a gold-set exists (W2 W3).
* Retention purge UI; v1 is keep until explicit delete.
* Reviewer PATCH/edit of vendor, date, total, and line items (PRD 5.7; not in section 9 ACs).

## Handoff

* Implementation artifact: .cursor/rpi-tracking/changes/2026-08-29/receipt-taking-changes.md
* Ready phase or task: P06 complete (declared scope)
* Remaining provisional question or blocker: none; caller will manually test inbox and Classify overlay (no browser MCP)
