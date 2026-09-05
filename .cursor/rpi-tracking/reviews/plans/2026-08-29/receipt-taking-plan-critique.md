<!-- markdownlint-disable-file -->
# RPI Plan Critique: Receipt taking

## Metadata

* Task ID: RT-20260829
* Critique date: 2026-08-29
* Plan: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md
* Critique execution status: Complete

## Inputs and Criterion Boundary

* Task context and caller requirements: Implement the current milestone of docs/prds/receipt-taking.md. Locked constraints: Amazon excluded; Live persist only; hybrid extract; 30 percent fuzzy tip never auto-bind; Classify cheap lookup. Locked test ownership from the plan: API unit under apps/api/src/features/receipts/**/__tests__; OpenRouter tests extend apps/api/src/features/categorization/llm/__tests__/openRouterClient.test.ts; web tests under apps/web/src/components/review/classify/__tests__. Exact removals: none. Max additions: one receipts feature tree plus classify overlay files; no second persistence stack.
* Research and evidence considered: .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md (C1-C40, W1-W3); docs/prds/receipt-taking.md (product intent and section 9 ACs 1-11). Subagent lane files were not independently re-read; primary research is the evidence of record.
* Decisions, dependencies, and acceptance criteria considered: Plan User Decisions and Requirements; Goals G1-G6; Functional Requirements mapped to PRD AC 1-11; phase dependency graph P01→P02→P03/P04→P05→P06; Test ownership (locked); PRD 5.1-5.7 and 5.5 step function A-F; research selected recommendation (filesystem originals, Live write gate not requireLiveMode, TSOA JSON, generic matcher, tesseract.js first, Practice session-only).
* Assessment boundary: This critique judges plan and phase-detail credibility against the supplied PRD milestone, caller locks, and research. It does not inspect live source, does not invent missing repo APIs as fact, and does not reopen confirmed user direction (Amazon excluded, Live persist only, hybrid extract, 30 percent fuzzy never auto-bind, cheap Classify lookup). PRD later/back-pocket items and ops follow-ups (HTTPS/LAN, OCR A/B, retention purge) are out of the implementation bar.

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| PRD AC 1 (card capture Live/Practice) | Partial | P05-T02 owns camera/file and Live POST; Practice session store is named but has no match/extract path (PC-001) |
| PRD AC 2 (inbox burst) | Covered | P06-T01 inbox without focused txn |
| PRD AC 3 (exact unique auto-bind) | Partial | P03-T01/T02 cover Live unique/collision; Practice session auto-bind is unspecified (PC-001) |
| PRD AC 4 (fuzzy 30 percent, never auto-bind) | Covered | P03-T01 table-driven cap and printed-zero; P06 pick-to-bind |
| PRD AC 5 (search/filter pick) | Partial | P06-T01 names search pick; Postgres query surface is "or similar" (PC-006) |
| PRD AC 6 (Amazon skip, cheap lookup, skip LLM on ready) | Covered | P05-T01 needsReceiptLookup / needsLlmSuggest; P03-T02 lookup is stored keys only |
| PRD AC 7 (loud extract, no fabricated keys) | Covered | P04 status enum and overlay chrome; failure stored not silent success |
| PRD AC 8 (header vs OCR blocks exact auto-bind) | Partial | P04-T02 says matcher reads a flag; P03 tests and P01 schema do not own it (PC-003) |
| PRD AC 9 (equal-share vs gated, classification_sync) | Partial | P06-T02 forbids allocateAmazonItemsToBank; helper home conflicts with locked API tests (PC-007) |
| PRD AC 10 (Live restart / Practice refresh) | Covered | P01 file+row roundtrip; Practice writes refused; no process-restart test (accepted residual) |
| PRD AC 11 (hybrid extract pipeline) | Partial | P04-T01/T02 match flowchart; prep has no image library and may skip deskew/stitch (PC-005) |
| G7 / NFR lookup (no OCR/OpenRouter on miss) | Covered | P03/P05: GET lookup only; lookup must not import pipeline; miss does not enqueue extract |
| Amazon excluded (caller + PRD 5.4/5.5 A) | Covered | isAmazonTransaction skip in matcher, no card capture, amazon-suggest unchanged; extract Amazon drop in P04 |
| Live persist only (caller + PRD Practice) | Partial | P01 helper and P02 403 are the right gate vs C26/C27; Practice capture/match still incomplete (PC-001) |
| Hybrid extract (caller + PRD 5.3) | Covered | Prep + cheap vision JSON + local OCR + gate + one repair; Classify never calls extract |
| Fuzzy 30 percent never auto-bind | Covered | P03-T01 expected tests; UI pick in P06 |
| Classify cheap lookup (caller + PRD 5.5 B) | Covered | Indexed SQLite read; P05-T01 never extract |
| Locked test ownership / one receipts tree | Partial | No second persistence stack. API receipts tests + classify overlay tests match the lock. P06-T02 equal-share vs web splitLines conflicts (PC-007). Inbox under review/receipts is extra web surface vs "classify overlay files" (residual, not a second DB) |
| C26 C27 Live gate vs travelWindows | Covered | P01-T02 uses getOperatingMode, not requireLiveMode |
| C36 C40 SDK regen | Partial | P02-T02 regen runs before P03-T02 adds lookup routes (PC-002) |
| C38 generic matcher not matchAmazonPayment | Partial | P03-T01 forbids Amazon imports; also allows duplicating the date window (PC-013) |
| C32 JSON body / data-URL | Partial | Research accepted JSON with a max-size env; P02 lists body size as unresolved, not a P02-T01 validation (PC-004) |
| PRD 5.1 one receipt many frames | Partial | P02 optional multi-frame list; P05 capture does not own grouping (PC-010) |
| PRD 5.7 reviewer edit keys/lines | Missing | Plan user decisions claim edit; no PATCH or UI task; P06 excludes extract UI beyond status (PC-011) |
| P01 persist | Covered | Schema, RECEIPTS_DIR, Live helper, hash dedupe, migrate.test |
| P02 HTTP API | Partial | CRUD/bind/image GET aligned with TSOA JSON; body limit and edit missing |
| P03 matcher | Partial | Exact/fuzzy/Amazon skip tested; AC8 and receipt→txn query incomplete |
| P04 extract | Partial | Pipeline and Amazon drop present; prep dep and drop semantics incomplete |
| P05 overlay | Partial | LLM skip and Amazon-unchanged are right; Practice and ready/pending gates incomplete |
| P06 inbox and splits | Partial | Inbox + equal-share intent match ACs 2/5/9; search API and helper ownership incomplete |

## Verdict

* Verdict: Revise
* Rationale: The plan is the right extension shape (receipts SQLite feature, Live write gate, generic matcher, hybrid extract, cheap Classify lookup) and honors locked Amazon / fuzzy / no-second-persistence constraints. It is not implementation-ready: Practice matching has no executable path, web-sdk regen is sequenced before lookup routes exist, exact auto-bind on header/OCR disagreement is not a matcher contract, and Live create/extract will not survive real photos without an owned JSON body limit and image-prep dependency. Those are planner corrections, not user reopeners.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Practice capture has no matcher or extract path

* Related IDs: PRD AC 1; PRD AC 3; PRD 5.4 Live vs Practice; G3; C37; P05-T01; P05-T02; P02-T01; P03
* Evidence: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md (Practice session only, including capture; Practice POST 403); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P05-T01 (Fetch GET lookup only) and P05-T02 (Practice does not call write APIs); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C37; docs/prds/receipt-taking.md (matcher still runs in Practice; Practice keeps the pair in session only)
* Concern: Matcher and extract live on the API behind Live writes. Practice is 403 on POST and GET-only lookup against SQLite. Session receipts therefore never obtain vendor/date/total or exact/fuzzy candidates. P05-T01 in Practice would either always miss or overlay Live SQLite rows onto a Practice session.
* Impact: AC 3 Practice auto-bind and PRD "matcher always runs" cannot be implemented as specified. Implementers will either skip Practice matching (product miss) or persist Practice receipts (violates the Live-persist-only lock).
* Smallest useful change: In P05 (and P03 if needed), specify how Practice matching runs with zero SQLite/file writes: run the same pure matcher against in-memory session receipts, and define whether Practice extract is skipped, client-side, or an API dry-run that does not insert rows. P05-T01 must not GET Live lookup while operatingMode is Practice unless that read-only behavior is an explicit accepted residual.
* Action owner: planning_parent
* Exact resolving evidence: Phase details for P05-T01/T02 name a Practice match/extract sequence, tests for session auto-bind and refresh-clears-binds, and a sentence that Practice never calls receipt write APIs or Live lookup unless explicitly allowed.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: web-sdk regen happens before lookup routes exist

* Related IDs: P02-T02; P03-T02; P05-T01; C36; C40
* Evidence: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md P02-T02 (regen after create/list/get/image/bind/detach); P03-T02 (GET lookup-by-transaction and lookup-by-receipt); P05-T01 dependency (P03-T02 SDK lookup); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C36 C40
* Concern: The only SDK regeneration task is P02-T02. Lookup endpoints are added later on receiptsController. P05-T01 is specified to consume generated lookup methods that the plan never regenerates.
* Impact: P05 overlay work starts without typed lookup clients unless implementers invent an extra regen outside the checklist, which the plan will not notice as incomplete.
* Smallest useful change: Add OpenAPI plus web-sdk regen to P03-T02 validation expectations (or move lookup routes into P02-T01 so the existing regen covers them).
* Action owner: planning_parent
* Exact resolving evidence: P03-T02 expected result includes regenerated named lookup methods; P05-T01 depends on those generated methods, not an unspecified extra regen.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [High]: Header vs OCR disagreement is not a matcher contract

* Related IDs: PRD AC 8; PRD 5.3 cross-check; PRD 5.7 no auto-match on disagreement; P01-T01; P03-T01; P04-T02
* Evidence: docs/prds/receipt-taking.md AC 8; .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P04-T02 (Header/OCR total disagreement blocks exact auto-match (matcher reads that flag)); P03-T01 expected tests (exact unique, collision, Amazon skip, fuzzy cap, printed zero) omit disagreement; P01-T01 extract_status columns have no disagreement/failed-cross-check value
* Concern: The safety rule that distinguishes this matcher from "unique amount auto-binds" lives only as a P04 note. P03 can ship exact unique auto-bind on extract_json totals that disagree. extract_status planned values (pending, gated, ungated, failed, dropped-amazon) do not encode cross-check failure.
* Impact: AC 8 can pass extract tests and fail in production binds. G6 silent-bad-data risk.
* Smallest useful change: Put a stored, queryable disagreement (status or boolean on the row) in P01-T01; add a P03-T01 case that unique amount plus disagreement does not auto-bind; keep fuzzy/search allowed.
* Action owner: planning_parent
* Exact resolving evidence: P01 schema/docs name the flag; P03-T01 test table includes disagreement; P04-T02 writes that flag and does not invent a second matcher rule.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [High]: Live JSON create has no owned body-size limit

* Related IDs: P02-T01; C32; C35; PRD AC 1; PRD AC 2
* Evidence: .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C32 (express.json only) and Wave 3 (JSON with a max-size env for household tapes); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P02 Unresolved Items (Max JSON body size) vs P02-T01 validation (Live vs Practice write tests only)
* Concern: Camera stills as data URLs will exceed default Express JSON limits. The plan knows this and left it unresolved instead of a P02-T01 expected result. Failures would be opaque 413/parse errors, not the loud extract/camera contract.
* Impact: P02/P05/P06 capture can work in tiny fixture tests and fail for real stills. That is an environment/config gap the phase must own, not a silent later patch.
* Smallest useful change: Make a documented RECEIPTS_JSON_BODY_LIMIT (or equivalent) in environment.ts part of P02-T01, wired in server.ts, with a loud too-large error; keep multipart out of v1.
* Action owner: planning_parent
* Exact resolving evidence: P02-T01 likely targets and validation name the env and the 413/typed failure; P02 Unresolved Items no longer includes body size as optional.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-005 [High]: Extract prep has no dependency or owned v1 recipe

* Related IDs: PRD AC 11; PRD 5.3 prep; C29; W3; P04; P04-T02
* Evidence: docs/prds/receipt-taking.md (prep is crop/deskew/contrast/stitch/downsample, not optional garnish); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C29 (no OCR/image-prep libraries); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P04 (pnpm add only tesseract.js; unresolved: skip deskew rather than fake it; stitch if frames already concatenated client-side or simple vertical stitch)
* Concern: AC 11 requires preprocess before vision/OCR. The repo has no image library. The phase adds tesseract.js only. Implementers cannot downsample, contrast, or stitch in Node without an unplanned pnpm dep or by skipping prep. Deskew skip is an accepted quality residual; skipping all prep is not.
* Impact: Cost/quality control in the PRD extract flowchart is unenforceable. A later sharp (or similar) add would appear as an extra dep outside locked P04 recipe.
* Smallest useful change: In P04, name the v1 prep steps that are required (at least downsample plus contrast; stitch when P02 sends multiple frames) and the pnpm package that implements them. State deskew as explicit non-goal if skipped.
* Action owner: planning_parent
* Exact resolving evidence: P04-T02 includes pnpm add for the prep library (or a one-file existing-stack approach that research already supports, which it does not) and validation that processed bytes, not originals, go to OpenRouter/OCR.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-006 -->
### PC-006 [Medium]: Receipt-to-transaction lookup has no mapped Postgres read

* Related IDs: PRD G3; PRD 5.4 shared matcher; P03-T02; P06-T01; C1
* Evidence: .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P03-T02 (matcher may query Postgres; categorization listTransactionsByIds or similar); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C1 (transactions in Postgres) with no finding for date-window plus amount listing or search/filter API
* Concern: txn→receipt can be SQLite by keys. Receipt→txn and inbox search need non-Amazon Postgres rows in a date window, then by payee/amount, then arbitrary filter. listTransactionsByIds does not find candidates. Research did not map the query.
* Impact: P03-T02 and P06-T01 will invent a transaction search surface mid-implement, possibly a second stack or an N+1 filmstrip scan.
* Smallest useful change: Name the existing categorization/Postgres function to extend, or add one receipts-adjacent query module that is not a second persistence stack. P06-T01 Amazon-never-in-search becomes a filter on that query.
* Action owner: planning_parent
* Exact resolving evidence: P03-T02 likely targets cite a real list/search function (or a new one under features/receipts that reads Postgres the same way classify already does); P06-T01 reuses it.
* Decision route: direct planner correction (if no existing function exists in research, treat as a named research gap to resolve in the plan with a pointer, not a user product question)

<!-- rpi:critique id=PC-007 -->
### PC-007 [Medium]: Equal-share helper home conflicts with locked tests

* Related IDs: PRD AC 9; C13; P06-T02; Test ownership
* Evidence: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md Test ownership (API unit receipts tests include equal-share); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P06-T02 (new helper next to splitLines.ts)
* Concern: Locked critique ownership puts equal-share tests in the API receipts tree. Phase details place the helper on the web next to splitLines. That either duplicates logic or puts production code where the locked tests will not see it.
* Impact: AC 9 can be implemented twice (Amazon-style drift) or web-only with no API unit the lock required.
* Smallest useful change: Put equalShareBankMilliunits in apps/api/src/features/receipts with tests there, and have the web seed from the DTO; or change locked test ownership in the same revision if the helper must live next to splitLines (one home, not both).
* Action owner: planning_parent
* Exact resolving evidence: P06-T02 likely targets and Test ownership name the same file tree; one test file covers remainder-on-last and one-category-no-fake-split.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-008 -->
### PC-008 [Medium]: Amazon-vendor drop semantics can race lookup and leave binds

* Related IDs: PRD 5.3 Amazon extract dropped; P04-T02; P02-T01; P03
* Evidence: docs/prds/receipt-taking.md (if vendor is Amazon: no row, no matcher candidate); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P04-T02 (dropped-amazon status; no row or row deleted plus file removed); P02-T01 optional bind on create from Classify card
* Concern: Create stores a pending row (and may set transactionId) before extract. Drop is specified as either delete or a dropped-amazon status. A dropped row that remains is a matcher candidate. A deleted row may leave a card bind with no document. The plan does not say to clear transactionId on drop.
* Impact: Inbox/Classify can show or auto-bind an Amazon paper tape captured from a non-Amazon door, violating Amazon-excluded.
* Smallest useful change: Lock one behavior: delete file plus row (PRD no row) and clear any transactionId; matcher never returns dropped rows; tests cover create-then-Amazon-vendor.
* Action owner: planning_parent
* Exact resolving evidence: P04-T02 expected result is a single drop behavior with tests; P03 candidate lists exclude dropped/deleted Amazon receipts.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-009 -->
### PC-009 [Medium]: Extract-ready is not defined for the LLM skip gate

* Related IDs: PRD 5.5 C D E; P05-T01; G7
* Evidence: docs/prds/receipt-taking.md step C (exact unique, extract ready → skip llm-suggest) vs D (exact unique, extract still running → pending, keep local proposal, do not block filmstrip); .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md P05-T01 (needsLlmSuggest false on exact unique ready extract)
* Concern: Ready vs pending vs ungated vs failed is unspecified. Ungated still has equal-share drafts and should skip generic LLM per C. Pending must not skip LLM (D). Failed should not skip LLM or fabricate splits. P05-T01 tests list ready vs miss vs Amazon, not pending.
* Impact: Filmstrip either waits on extract (G7 miss) or skips LLM on a pending exact bind and shows an empty overlay as if seeded.
* Smallest useful change: Define ready as extract_status gated or ungated (and not disagreement if PC-003 requires that). Add P05-T01 tests: pending keeps needsLlmSuggest true; failed does not skip LLM.
* Action owner: planning_parent
* Exact resolving evidence: P05-T01 expected tests include pending and failed; details cite PRD steps C and D.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-010 -->
### PC-010 [Medium]: Multi-frame one document is not owned on the capture client

* Related IDs: PRD 5.1 one receipt many frames; P02-T01; P04; P05-T02
* Evidence: docs/prds/receipt-taking.md (overlapping shots of one long tape are one receipt document); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P02-T01 (optional multi-frame list); P04 (stitch if concatenated client-side or simple vertical stitch); P05-T02 (camera/file on non-Amazon cards) with no batching UX
* Concern: Byte-hash dedupe will create one row per still if the client POSTs each frame. Stitch ownership is split across client and P04 with neither task required to produce one document.
* Impact: Long tapes become multiple matcher candidates and duplicate exact-amount collisions (AC 3 false unbound).
* Smallest useful change: P05-T02 (and P06 inbox capture) must send one POST with all frames for one tape, or P04 must stitch a server-side frame list from that POST. Pick one; do not leave both optional.
* Action owner: planning_parent
* Exact resolving evidence: P02 DTO and P05/P06 capture validation describe one receipt id for N frames; a test or explicit AC note covers two frames → one row.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-011 -->
### PC-011 [Medium]: Reviewer edit is claimed without a task

* Related IDs: PRD 5.7 reviewer can edit; plan User Decisions; P02; P06
* Evidence: .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md (Reviewer can detach, edit vendor/date/total/lines); docs/prds/receipt-taking.md 5.7; section 9 ACs 1-11 do not include an edit AC; P06 Boundaries (Excluded: extract UI beyond status); P02 routes list create/list/get/image/bind/detach/delete, no PATCH extract
* Concern: The plan treats edit as in-scope for this milestone but no phase owns API or UI. Current milestone ACs do not require it. That is an internal contradiction, not a new product question.
* Impact: Implementers may build an unplanned PATCH surface or ship a plan that claims 5.7 and cannot pass a walkthrough against its own user-decision list.
* Smallest useful change: Drop edit from this milestone's claimed requirements (keep detach, overlay display, and split confirmation), or add a P02 PATCH plus a P06/P05 edit control. Prefer drop to stay inside locked file budget unless section 9 is extended by the user.
* Action owner: planning_parent
* Exact resolving evidence: User Decisions and P02/P06 either omit edit or name the PATCH/UI task; section 9 is not silently expanded.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-012 -->
### PC-012 [Medium]: Fuzzy payee cutoff is an unbounded implementer number

* Related IDs: PRD 5.4 fuzzy similar payee; C15; P03-T01; P03 Unresolved Items
* Evidence: .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P03 Unresolved (use nameSimilarity with a tested cutoff; document the cutoff in matcher test names); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md C15 (nameSimilarity exists, unused by Amazon match)
* Concern: "Similar payee" is a product rule with no numeric threshold. Leaving it unresolved means P03-T01 invents a magic number that later looks like a product decision.
* Impact: Fuzzy lists will be empty or noisy without a locked, tested cutoff; AC 4 ranking will not be reviewable against the plan.
* Smallest useful change: Lock a cutoff in P03-T01 (reuse any existing nameSimilarity caller threshold if research had one; otherwise pick a documented constant in the matcher tests). This is not a user-facing product fork.
* Action owner: planning_parent
* Exact resolving evidence: P03-T01 names the cutoff in test titles; Unresolved Items no longer includes the threshold.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-013 -->
### PC-013 [Low]: Date window may be duplicated instead of shared

* Related IDs: PRD 5.4 shared helper; C9; C14; C38; P03-T01
* Evidence: docs/prds/receipt-taking.md (share amazonPaymentDateWindow: bank date minus 5 through plus 1); .cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md (tiny generic helper; do not import matchAmazonPayment); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P03-T01 (duplicate the six-line date window or extract a tiny shared helper)
* Concern: Research already chose a tiny generic helper. Phase details allow copy-paste, which will drift from Amazon's window and violate "shared helper" without importing Amazon types.
* Impact: Low if both copies stay minus 5 / plus 1; medium later when one side changes. Cheap to lock now.
* Smallest useful change: P03-T01 must extract or reuse addIsoDays / a receipts-local window helper used by tests; delete the "duplicate" option.
* Action owner: planning_parent
* Exact resolving evidence: P03-T01 likely targets a named window helper; Amazon match file is not imported.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-014 -->
### PC-014 [Low]: Vendor is required for indexed lookup but not indexed

* Related IDs: PRD 5.5 indexed lookup; P01-T01
* Evidence: docs/prds/receipt-taking.md 5.5 (date, milliunits, vendor queryable without scanning images); .cursor/rpi-tracking/details/2026-08-29/receipt-taking-phase-details.md P01-T01 (indexes on purchase_date, printed_milliunits, transaction_id)
* Concern: Vendor/payee haystack is an exact-tier input. Household cardinality is small, so missing index is unlikely to break G7, but the schema note does not match the PRD index list.
* Impact: Low at v1 volume; cheap to add in P01-T01.
* Smallest useful change: Add a vendor index (or document that exact match filters in process after date+amount and vendor is not a SQLite index key).
* Action owner: planning_parent
* Exact resolving evidence: P01-T01 index list matches the lookup query P03-T02 will run.
* Decision route: direct planner correction

## Strengths and Residual Risk

* Live write gate is the correct non-copy of travelWindows (C26, C27). Practice 403 plus getOperatingMode is the right dangerous-path fix.
* Classify step function matches PRD A then B then C: Amazon unchanged, cheap GET, skip llm-suggest only on exact unique ready extract, miss does not start extract.
* Fuzzy 30 percent cap, printed zero excluded, collisions unbound, and never auto-bind are first-class P03 tests. Equal-share is explicitly not allocateAmazonItemsToBank (C13).
* Hybrid extract matches the user-confirmed pipeline: cheap vision headers, local OCR lines, arithmetic gate, one repair, in-process enqueue, Classify never imports the pipeline.
* Persistence shape matches research: one API SQLite receipts feature, filesystem originals, no Postgres blobs, no multipart, no bullmq. Locked "no second persistence stack" is honored.
* Explicit follow-ups are correctly out of v1: Vite HTTPS/LAN (C21), OCR A/B after gold-set (W2/W3), retention purge UI.
* Accepted residual risks if the High findings are fixed: no browser E2E in the plan (P05/P06 verify with available browser tools); AC 10 restart proven by file+SQLite roundtrip rather than a real process restart; tesseract.js may lose to paddle on gold-set; deskew quality if explicitly non-goal; physical phone camera remains ops.

## Questions or Blocking Evidence Gaps

* None blocking. PC-006 is a planning gap (Postgres search analog not mapped in research) that the planning parent can close by naming an existing classify/Postgres read or a receipts-adjacent query. It does not require a user product decision.

## Limitations

* Critique used only the four supplied artifacts plus caller locks. It did not re-read Wave 1 subagent files or live source, so "listTransactionsByIds or similar" was treated as unspecified, not as a verified missing function.
* Section 9 ACs 1-11 are the milestone bar. PRD 5.7 edit and 5.2 replay are flagged only where the plan itself claims them (PC-011) or not at all (replay).
* Cost NFR (under $0.01/receipt) is accepted as log-usage.cost plus cheap default model, not as a measured fixture in the plan.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: planning_parent
* Smallest next action: Revise P05/P03 Practice matching (PC-001), then fold PC-002 through PC-005 into the same plan and phase-details pass (SDK regen, AC 8 matcher flag, JSON body limit, prep dependency). Do not start P01 until those High items are in the dated plan.
* User response required: no
