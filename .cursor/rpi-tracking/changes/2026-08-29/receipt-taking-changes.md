<!-- markdownlint-disable-file -->
# RPI Changes: Receipt taking

## Metadata

* Task ID: RT-20260829
* Related plan: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md
* Implementation date: 2026-08-29

## Execution Status

* Status: Complete (declared scope P06)
* Declared invocation scope: P06
* Completed scope markers: P01, P02, P03, P04, P05, P06, P06-T01, P06-T02
* All remaining active-plan markers: none
* Status basis: P06 Inbox, search bind, and split drafts complete. Fettra gates passed. Phase commit recorded below.
* Next implementation boundary: none (declared P06 complete)

## Active Implementation Scope

* Starting scope: P06 complete.
* Approved write boundary: apps/web App/AppNav, /receipts inbox under review/receipts, classify capture/session receipts; apps/api receipts lookup/match-preview bindCandidates, equalShareBankMilliunits, splitDraft, Classify seed, buildLlmPrompt receipt context.
* Planned validation: local-review, build-checker, named tests, verifier — all run. Browser check of inbox plus Classify overlay unavailable (no browser MCP); caller will test after closeout.
* Current blockers: none

## Execution Summary

Planner applied PC-001 through PC-014. P01–P06 are complete. Declared invocation scope P06 is finished; full-plan Review waits on caller testing.

## Completed Work

### P06 Inbox, search bind, and split drafts

* Related phase or task: P06-T01 P06-T02
* Files: App.tsx, AppNav.tsx, ReceiptsPage, review/receipts (inbox, slip, bind panel, filterBindCandidates), PracticeReceiptsContext, practiceReceipts.ts, useReceiptCapture (null txnId, keepCameraOnAttach), ClassifyWorkspace split seed, useReceiptOverlay splitDraft, receiptsDtos bindCandidates/splitDraft, lookupReceiptMatch, receiptsRepo getReceiptByTransactionId, equalShareBankMilliunits, seedReceiptSplitDraft, buildLlmPrompt/suggestWithLlm receipt context, generated OpenAPI/SDK
* What changed and why: /receipts inbox captures unbound receipts without a Classify card; close matches plus search bind with Amazon excluded; Practice uses extract-preview, match-preview, and session receipts. Equal-share or gated splitDraft seeds Classify; Live accept still classification_sync. Bound non-pending extracts append gated vs unverified prompt context.
* Completion evidence: named tests API 15 + web 24; API tsc and web typecheck; local-review 10 confirmed then High/Medium/simplifying Low fixed (not re-run). Build-checker [P06 build-checker](d05c5130-07ac-4f64-98ea-71b75304ee4f). Verifier 9/9 pass [P06 verifier](7b604255-9d0d-4f09-9395-d31df7f5f995). Phase commit `5927361`. Browser E2E not run (no browser MCP).
* Validation: see Validation Record

### P05 Classify overlay and card capture

* Related phase or task: P05-T01 P05-T02
* Files: applyLlmOverlay.ts (receipt skip, shared prefetch helper), useLlmOverlay.ts, useReceiptOverlay.ts, useReceiptCapture.ts, practiceReceipts.ts, ClassifyWorkspace.tsx, ClassifyStage.tsx, ClassifyReceiptContext.tsx, ClassifyReceiptCapture.tsx, applyLlmOverlay.test.ts, practiceReceipts.test.ts
* What changed and why: Non-Amazon Classify cards cheap-lookup receipts and skip generic llm-suggest when extract is ready. Card camera/file capture is one frames array. Live POSTs create; Practice uses extract-preview and in-memory session receipts and never GET Live lookup. Amazon cards stay on amazon-suggest with no capture.
* Completion evidence: 20 overlay/practice tests; full classify __tests__ 73 passing; web typecheck pass; local-review 17 confirmed then High/Medium/simplifying Low fixed (not re-run). Verifier 8/8 pass [P05 verifier](de6590a5-52a9-4eb9-8fbf-0cc0ab7a9756). Build-checker typecheck failed once on missing ReceiptLlmSkip import then passed after the one-line import. Phase commit `523d719`. Browser E2E not run (no browser MCP); Vite HMR compiled the overlay files.
* Validation: see Validation Record

### P04 Extract pipeline

* Related phase or task: P04-T01 P04-T02
* Files: openRouterClient.ts (vision content array), receipts/pipeline (prep, OCR, gate, header/repair vision), extractReceipt.ts, extractPreview.ts, extractStoredReceipt.ts, receiptsController extract-preview + enqueue, receiptLimits.ts, environment OPENROUTER_RECEIPT_REPAIR_MODEL, sharp + tesseract.js, generated OpenAPI/SDK, live extractReceipt.live.test.ts
* What changed and why: Live create returns pending then extracts in-process (prep, cheap VL headers, vision lines, arithmetic gate). Practice uses extract-preview with no writes. Amazon vendor deletes the row. Classify lookup still does not import extract. Local Tesseract was removed after photographed USD receipts showed it never gated and repair already owned the lines.
* Completion evidence: 86 API tests including live OpenRouter (Fixture A gated Hearth and Rye 2026-08-01 8120 milliunits ~$0.00004; Fixture B amazon drop). SDK extractPreviewMutation. Wiring subagent plus live-extract subagent. Verifier all nine criteria pass. Phase commit `2143a24`. Tesseract drop post-commit correction committed as `6b0a403`.
* Validation: see Validation Record

### P03 Dual-direction matcher

* Related phase or task: P03-T01 P03-T02
* Files: apps/api/src/features/receipts/matchReceipts.ts, paymentDateWindow.ts, listTransactionsForReceiptMatch.ts, lookupReceiptMatch.ts, receiptsController.ts, receiptsDtos.ts, data/receiptsRepo.ts, assertReceiptLiveLookupAllowed.ts, amazonOrders/isoDate.ts (shared window constants), amazonClassify/matchAmazonPayment.ts, looksLikeImportName.ts (exported RAW_PAYEE_SIMILARITY_THRESHOLD), generated OpenAPI/routes, packages/web-sdk/src/gen
* What changed and why: Classify and inbox can match receipts to bank charges with the same −5/+1 window and unique-amount rule without OCR. Amazon payees are skipped. Exact unique can auto-bind; fuzzy 30% tips never auto-bind. Practice uses match-preview and cannot GET Live SQLite lookup.
* Completion evidence: matchReceipts tests (exact, collision, Amazon skip, fuzzy cap, printed zero, totalsDisagree), lookup Practice 403 and ephemeral preview, [P03 verifier](2779de39-19c7-4faf-bb48-ce9d15b8706e). SDK methods lookupByTransaction, lookupByReceipt, matchPreview. Phase commit `cdbd0b2`.
* Validation: see Validation Record

### P02 Receipts HTTP API and SDK

* Related phase or task: P02-T01 P02-T02
* Files: apps/api/src/features/receipts/receiptsController.ts, receiptsDtos.ts, createReceipt.ts, data/receiptsRepo.ts, apps/api/src/server.ts, payloadTooLarge.ts, environment.ts, generated OpenAPI/routes, packages/web-sdk/src/gen
* What changed and why: Browser can create/list/get/bind/detach Live receipts as JSON data-URLs with a documented 15 MiB body limit. Practice writes stay 403. Extra frames are stored beside the original and fetched with `?frame=`.
* Completion evidence: createReceipt tests (Practice 403, two frames one row, frame 1 bytes), payloadTooLarge tests, [P02 verifier](b26501ce-867d-47ae-b0fb-076ce0435e1f). Phase commit `3af8ec0`.
* Validation: see Validation Record

### P01 Persist Live receipts

* Related phase or task: P01-T01 P01-T02
* Files: apps/api/src/features/receipts/**, apps/api/src/data-persistence/migrations/2026-08-29-Receipt_Tables.ts, apps/api/src/data-persistence/database.ts, migrate.ts, sqliteBindingPlugin.ts, sqlBindingTransform.test.ts, apps/api/src/environment.ts, .env.local.example
* What changed and why: Live-only SQLite receipt rows and filesystem originals under RECEIPTS_DIR so Practice cannot persist captures. Hash dedupe recovers unique-constraint races. Delete removes the row before the file. Boolean plugin coerces snake_case totals_disagree.
* Completion evidence: migrate.test, receiptsRepo tests (Practice 403, Live write/dedupe/concurrent same-hash, extract/bind updates, delete), sqlBindingTransform tests. Phase commit `337f6a4`.
* Validation: see Validation Record

## Implementation-Time Plan and Detail Updates

### Local Tesseract dropped from extract

* Affected plan area or markers: P04-T02; PRD §5.3 two tools / VLM repair fallback
* What changed: Extract is cheap header vision plus schema-constrained line vision plus the arithmetic gate. tesseract.js is removed. The former repair call is the primary line extractor (printed total locked when headers have it). Header vs line-vision printed totals still set totalsDisagree.
* Why: Photographed USD receipts never gated on local OCR; OCR dumps were cash-tender/noise; repair already produced the grocery lines. Typical path was already two OpenRouter calls.
* Triggering evidence: live extracts on Walmart, Save Mart, Cameron Market; caller 2026-08-30
* User answer or decision: Drop Tesseract
* Reconciliation performed: P04 extract implementation; changes ledger
* Planning and critique state: ready; critique not re-run

### Local-review fix bar (mediums and simplifying lows)

* Affected plan area or markers: User Decisions; Acceptance Criteria Fettra gates; PRD §7 delivery constraint; phase details standing gate; local-review skill
* What changed: Calling agent now fixes Medium findings and Lows that simplify or improve consistency, quality, or duplication, not only Critical/High. Reviewer output contract no longer labels medium/low as non-blocking.
* Why: Caller 2026-08-30 wanted mediums addressed and simplifying lows kept
* Triggering evidence: caller instruction in chat
* User answer or decision: Fix Critical, High, Medium, and simplifying/consistency/quality/duplication Lows before each remaining Pxx commit
* Reconciliation performed: Plan, details, PRD, local-review SKILL.md and spawnReviewers output contract
* Planning and critique state: ready; critique not re-run

### Review before each Pxx commit

* Affected plan area or markers: User Decisions; Acceptance Criteria Fettra gates; PRD §7 delivery constraint; phase details standing gate
* What changed: local-review (Critical/High fixed) is required **before** the phase git commit, not only before marking the phase complete
* Why: Caller 2026-08-30 asked to bake review-before-commit into the plan and PRD so remaining phases cannot skip it
* Triggering evidence: caller instruction in chat
* User answer or decision: Code review before committing each remaining Pxx (P03–P06)
* Reconciliation performed: Plan User Decisions, Acceptance Criteria, highlights, details standing gate, PRD constraints and resolved list
* Planning and critique state: ready; critique not re-run

### Cursor local-review provider

* Affected plan area or markers: Fettra local-review gate
* What changed: Skill `.env.review` now selects Cursor; `CODE_REVIEW_PROVIDER` is read (wins over `LOCAL_REVIEW_PROVIDER`)
* Why: Vertex ADC was unavailable; caller set `CODE_REVIEW_PROVIDER=cursor` and `CURSOR_API_KEY` in the skill `.env.local`
* Triggering evidence: caller 2026-08-29
* Reconciliation: P01 local-review re-run on Cursor; no plan product-intent change

### Local-review before each Pxx gate

* Affected plan area or markers: User Decisions; Acceptance Criteria Fettra gates; Continuation context
* What changed: Each completed Pxx must run local-review on the phase slice and fix Critical/High before later Fettra gates
* Why: Caller 2026-08-29 required code review before finishing each gate; Fettra already listed code-review first, but P01 had skipped it
* Triggering evidence: caller instruction in chat
* User answer or decision: Run local-review before closing each Pxx gate set
* Reconciliation performed: User Decisions, Acceptance Criteria, Continuation context
* Planning and critique state: ready; critique not re-run

### Critique Revise applied

* Related phase or task: plan-wide
* What changed: Practice preview APIs, SDK regen on P03/P04, totals_disagree, JSON body limit, sharp prep, Postgres listTransactionsForReceiptMatch, equal-share on API, Amazon delete, extract-ready definition, multi-frame one POST, drop extract edit from milestone, fuzzy 0.85, shared paymentDateWindow, vendor index
* Triggering evidence: .cursor/rpi-tracking/reviews/plans/2026-08-29/receipt-taking-plan-critique.md
* Reconciliation: Critique Disposition resolved; no second critique

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| receiptsRepo + migrate + sqlite binding tests | P01 | Passed | vitest 9 tests after unique-hash recovery, extract/bind coverage, plugin QueryId fix |
| local-review | P01 | Passed | Cursor provider, composer-2.5; 5 confirmed (1 High fixed: concurrent hash collision; delete order and extract tests added). Not re-run after the High fix (no review loop). |
| typecheck | P01 | Passed | `pnpm --filter @budget-tools/api typecheck` after SqliteBindingPlugin Object.values + QueryId fixes |
| build-checker | P01 | Passed | [Build check](162b59bc-3cd2-4829-aedb-a97c538136e5) first run failed typecheck; same commands re-run locally after plugin/test fixes: typecheck pass, 9 tests pass |
| verifier | P01 | Passed | [P01 verifier](820f7a95-9f9d-4dbc-82cd-07fb18d77a1d) all six criteria pass |
| createReceipt + payloadTooLarge tests | P02 | Passed | vitest 10 tests: Practice 403, two frames one row, extra frame bytes, invalid base64, 413 message |
| local-review | P02 | Passed | Cursor composer-2.5; High extra-frame GET and documented global JSON limit fixed. Practice write gate already in repo (false positive). Not re-run after fixes. |
| typecheck | P02 | Passed | API and web-sdk typecheck |
| build-checker | P02 | Passed | [Build check](605b772e-cc54-4347-b30e-130d17807432) typecheck + 11 tests |
| verifier | P02 | Passed | [P02 verifier](b26501ce-867d-47ae-b0fb-076ce0435e1f) all seven criteria pass |
| local-review | P03 | Passed | Cursor composer-2.5; 16 confirmed. Highs: list filters extracted as receiptMatchTransactionCriteria + tests; amazonSkipped when receipt→txn inputs are all Amazon; window constants shared via isoDate (not importing matchAmazonPayment). Mediums: lookup assert in its own file; dropped source-regex test; JSDoc cross-account policy; null purchaseDate test; FUZZY_PAYEE_SIMILARITY_MIN aliases RAW_PAYEE_SIMILARITY_THRESHOLD; ClosePairMatch DTO alias; match-preview internal discriminated source. Skipped: CHANGELOG (repo has none); TSOA request-body union (throw-on-extras); collision listed as fuzzy (search is P06). Not re-run after fixes. |
| typecheck | P03 | Passed | API and web-sdk typecheck |
| build-checker | P03 | Passed | [Build check](bec22300-00af-40c9-9c73-9a2189a73e81) typecheck + 35 tests |
| verifier | P03 | Passed | [P03 verifier](2779de39-19c7-4faf-bb48-ce9d15b8706e) all six criteria pass |
| local-review | P04 | Passed | Cursor composer-2.5; 14 confirmed. Highs: max 8 frames; Amazon delete not persisted as failed; pending sweep on Live startup. Mediums: jpegDataUrl shared; Amazon OCR fallback; shouldRepair comment; header/OCR/repair warn logs; in-flight extract set; shared buildFailedReceiptExtract; Tesseract singleton + terminate tests; kickReceiptExtractIfPending tests. Skipped CHANGELOG (repo has none). Live OpenRouter tests added after review (caller). Not re-run after fixes. |
| typecheck | P04 | Passed | API and web-sdk typecheck |
| live OpenRouter extract | P04 | Passed | extractReceipt.live.test.ts with dotenvx: Fixture A gated HEARTH & RYE 2026-08-01 8120 milliunits (~$0.00004); Fixture B kind amazon (~$0.00004) |
| build-checker | P04 | Passed | [Build check](981ff013-dc55-483b-959f-38f451169466) tsc + web-sdk typecheck + 84 tests (live skipped without dotenvx) |
| verifier | P04 | Passed | [P04 verifier](c079bc00-3176-4b8a-ae29-2f75e5097dd1) all nine criteria pass |
| leftover P04 Tesseract drop commit | P04 | Passed | `6b0a403` before P05 writes |
| local-review | P05 | Passed | Cursor composer-2.5; 17 confirmed. Highs: Practice attach captured transactionId in mutation vars; pickFiles try/catch; bindAttempted reset on txn change and onError; overlay skip tests via buildReceiptLlmSkip. Mediums: shared prefetch helper; removed dead asking prop; one pending-extract surface; replace session receipt per txn; RefObject import; frame cap in setDraft updater. Skipped CHANGELOG (repo has none). Retry-on-AbortError kept to match Amazon/LLM overlay hooks. Exact-unique ready still skips LLM if Live bind POST fails (PRD C; bind retry is separate). Not re-run after fixes. |
| typecheck | P05 | Passed | web typecheck after ReceiptLlmSkip import |
| named classify tests | P05 | Passed | applyLlmOverlay 18 tests + practiceReceipts 2; full classify __tests__ 73 tests |
| build-checker | P05 | Passed | [Build check](f914062f-d792-44a4-b818-88067e945178) first typecheck fail (ReceiptLlmSkip); parent re-ran typecheck pass. Tests 73 pass. Model slug composer-2.5-fast (composer-2.5 not in Task allowlist). |
| verifier | P05 | Passed | [P05 verifier](de6590a5-52a9-4eb9-8fbf-0cc0ab7a9756) all eight criteria pass |
| browser overlay + capture | P05 | Unavailable | No browser MCP in this session; Vite HMR compiled overlay files. Manual phone/camera check remains for the reviewer. |
| local-review | P06 | Passed | Cursor composer-2.5; 10 confirmed. High: inbox auto-bind retry via bindMutation.onError clearing bindAttempted. Mediums: toReceiptMatchDto no `'in'` branch; parseExtractPayload console.warn; Classify auto-split skips Amazon card and overlay lines; failed extract stays unverified in LLM prompt (test). Skipped: split into PRs (phase scope); dropping dual list query keys (P05 overlay vs SDK keys both needed). Not re-run after fixes. |
| typecheck | P06 | Passed | API `tsc --noEmit` and web typecheck |
| named tests | P06 | Passed | API 15 (equal-share, seedReceiptSplitDraft, lookup/match-preview, LLM prompt); web 24 (filterBindCandidates Amazon skip, practice receipts, operatingMode copy) |
| build-checker | P06 | Passed | [P06 build-checker](d05c5130-07ac-4f64-98ea-71b75304ee4f) typecheck + named tests |
| verifier | P06 | Passed | [P06 verifier](7b604255-9d0d-4f09-9395-d31df7f5f995) all nine criteria pass |
| browser inbox + overlay | P06 | Unavailable | No browser MCP; caller will test after closeout |
| phase git commit | P06 | Passed | `5927361` |

## Blockers

* none

## Remaining Work

* Caller manual testing of /receipts inbox and Classify overlay (browser MCP unavailable)
* Full-plan `@rpi-review` only if the caller wants it after that testing (declared scope was P06, not the full plan)

## Follow-Up Items

* Vite HTTPS/LAN, retention purge, reviewer extract edit (plan Follow-Up Items)
* Local OCR A/B dropped with tesseract (caller 2026-08-30); re-open only if a gold set needs a non-vision line engine
* Postgres integration test for listTransactionsForReceiptMatch (verifier residual; plan has no integration tests beyond migrate.test)

## Handoff

* Ready for Review: no (declared P06 complete; full-plan Review after caller tests inbox + Classify overlay)
* Next implementation boundary: none
