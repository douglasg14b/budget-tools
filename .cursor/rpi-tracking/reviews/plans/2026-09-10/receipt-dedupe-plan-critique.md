<!-- markdownlint-disable-file -->
# RPI Plan Critique: Receipt dedupe

## Metadata

* Task ID: RD-20260910
* Critique date: 2026-09-10
* Plan: .cursor/rpi-tracking/plans/2026-09-10/receipt-dedupe-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md
* Critique execution status: Complete

## Inputs and Criterion Boundary

* Task context and caller requirements: Task RD-20260910. Auto-reuse the Live receipt row on SHA-256 identical originals (already implemented) or a tight perceptual hash of the Scanic processed JPEG at create time. Do not change receipt-to-bank matching. User confirmed keep_both: do not silent-merge on vendor/date/total when photos differ. Immediate image hash at capture. Fettra local-review plus gates before each Pxx commit (standing). Locked critique inputs: API receipts plus migrate tests; web has no tasks; exact removals none; maximum additions one migration, migrate registry, schema field, perceptualHash module plus tests, receiptsRepo plus tests, optional createReceipt test; no matchReceipts, lookupReceiptMatch, web, or OpenAPI DTO change unless compile forces schema typing; ReceiptDto does not gain perceptualHash; semantic coverage Hamming tau boundary, processed vs original, SHA-256 first, near reuse, far insert, different fixtures stay two rows, reuse does not overwrite processed or transactionId, kick extract only if pending; validation per Pxx is local-review, build-checker backend, named tests, verifier, then phase git commit.
* Research and evidence considered: .cursor/rpi-tracking/research/2026-09-10/receipt-dedupe-research.md; .cursor/rpi-tracking/research/subagents/2026-09-10/perceptual-hash-js-subagent-research.md; docs/prds/receipt-taking.md (cite only); apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/createReceipt.ts; apps/api/src/features/receipts/extractStoredReceipt.ts; apps/api/src/features/receipts/matchReceipts.ts; apps/api/src/features/receipts/lookupReceiptMatch.ts; apps/api/src/features/receipts/receiptsController.ts; apps/api/src/features/receipts/data/receiptsSchema.ts; apps/api/src/features/receipts/receiptsDtos.ts; apps/api/src/data-persistence/migrate.ts; apps/api/src/data-persistence/migrations/2026-08-29-Receipt_Tables.ts; apps/api/src/data-persistence/database.ts; apps/api/src/data-persistence/__tests__/migrate.test.ts; apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts; apps/api/src/features/receipts/__tests__/createReceipt.test.ts; apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts; apps/web/src/components/review/classify/receiptCaptureAttach.ts; apps/web/src/components/review/classify/useReceiptCapture.ts.
* Decisions, dependencies, and acceptance criteria considered: Plan User Decisions and Requirements; Goals G1–G3; Functional and Non-Functional Requirements; Acceptance Criteria; P01 (column plus hash helper) and P02 (insert reuse); keep_both; matcher isolation; SHA-256 persist contract C4/C6/C9/C24; research Q3 tight tau 5 fail-closed with fixture calibration deferred; Fettra phase commits; locked maximum-addition and test-ownership bounds.
* Assessment boundary: Credibility of the plan and phase details against supplied caller locks, research, PRD citations, and listed code evidence. Does not open-web research, does not edit plan sources, does not measure fixture Hamming histograms, and does not reopen confirmed user direction (auto-dedupe recaptures, no matcher edits, immediate create-time hash, keep_both when extract keys match but photos differ, Fettra gates before each Pxx commit). Confirmed user requests outrank critique advice.

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| G1 reuse on SHA-256 or tight processed pHash before extract | Partial | P02-T01 places compare after contentHash miss and before new id; incoming undecodable JPEG policy is unspecified (PC-001) |
| G2 leave matchReceipts, Classify lookup, extract gates unchanged | Covered | Non-goals and P02-T02 git-diff exclusion of matchReceipts.ts and lookupReceiptMatch.ts; kickReceiptExtractIfPending stays the controller gate |
| G3 fail closed on uncertain identity | Partial | Tau 5 of 64 pinned; keep_both honored; null/throw-as-non-match for incoming bytes not locked (PC-001) |
| FR SHA-256 hit persist contract | Covered | Early return in insertReceiptOriginal; tests already cover processed-if-absent and ignored transactionId; P02 must not alter that branch |
| FR pHash processed then original via sharp | Partial | Intent is in P02-T01 context; T01 validation list omits a named processed-vs-original case (PC-004) |
| FR Hamming within tau reuses row | Partial | Distance 0/5/6 named; insert-level 5/6 depends on an optional seam (PC-002) |
| FR far hash or no hash inserts | Covered | Far insert and two-fixture distinctness named in P02-T02 |
| FR no extract-key merge, no matchReceipts identity | Covered | Non-goal; keep_both; no field-merge function in maximum additions |
| NFR tau 5 bits of 64, boundary tests | Partial | P01-T02 covers 5 vs 6 as pure functions; insert reuse of those distances is not testable without a required seam (PC-002) |
| NFR single decoder, no web hash dep | Covered | API-only; web package.json excluded; Live already POSTs processed (receiptCaptureAttach.ts) |
| NFR Classify lookup stays indexed | Covered | lookupReceiptMatch.ts not modified; perceptual compare only on Live create |
| NFR household scan of stored strings plus lazy backfill | Covered | P02-T01; NFR says do not re-read bytes for rows that already have perceptualHash |
| AC byte-identical still one row | Covered | Existing receiptsRepo duplicate test remains regression |
| AC near pHash reuses and does not second-extract | Covered | Controller still kickReceiptExtractIfPending; extractEnqueue tests remain regression; perceptual reuse returns the existing extractStatus |
| AC different fixtures stay two rows | Covered | walmart.jpg / save-mart.jpg / cameron-market.jpg named; do not loosen tau if recompress exceeds it |
| keep_both user decision | Covered | Extract-key silent merge is a non-goal; possible-duplicate UX is follow-up |
| PRD 5.1 Dedupe (cite) | Covered | Byte plus perceptual recapture; PRD not rewritten; checkbox update is follow-up |
| Research Q3 tau uncalibrated / recapture miss | Covered | Explicit accepted default; household histograms are follow-up, not a blocker |
| C4 C6 C9 C24 reuse semantics | Covered | P02-T01 persist contract; writeProcessedIfAbsent; no transactionId overwrite |
| C12 matcher uniqueness | Covered | Missed dedupe stays conservative; plan does not edit matchReceipts.ts |
| P01-T01 migration, schema, registry | Partial | Registry and nullable non-unique column are sound; ReceiptRow literal compile surface not named (PC-005) |
| P01-T02 pHash module | Partial | Exports and loud invalid Hamming lengths are sound; tiny jpegBytes option is not a decodable JPEG (PC-001) |
| P02-T01 insert near-duplicate lookup | Partial | SHA-256 first and lazy backfill are sound; incoming hash failure, tie-break, and processed-vs-original tests need locks (PC-001, PC-002, PC-003, PC-004) |
| P02-T02 regression and matcher isolation | Covered | Named tests match locked regression list; web and matcher files excluded |
| Locked test ownership / max additions | Covered | Findings stay inside API receipts plus migrate; compile-forced extractEnqueue literal is allowed schema typing, not a DTO/OpenAPI change |
| Fettra Pxx gates then phase git commit | Covered | Plan user decisions and details locked validation order |

## Verdict

* Verdict: Revise
* Rationale: Layering, matcher isolation, keep_both, SHA-256-first, API-only sharp hashing, and the P01/P02 split are credible and match confirmed user direction. The plan is not implementation-ready until P02 specifies fail-closed behavior when perceptualHashOf cannot decode the incoming (or sibling) JPEG — the named regression suite inserts 6-byte JPEG headers that sharp cannot hash — and until insert-level tau 5/6, oldest-createdAt ties, and processed-vs-original coverage are locked as required tasks rather than unresolved or optional. Those are planner corrections; they do not reopen keep_both, matcher edits, or tau calibration as a user decision.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Incoming hash failure vs stub-JPEG regression suite

* Related IDs: G1; G3; P01-T02; P02-T01; regression receiptsRepo/createReceipt/extractEnqueue tests; C4; NFR fail closed
* Evidence: insertReceiptOriginal currently hashes originals with SHA-256 only and inserts 6-byte buffers such as Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) in receiptsRepo.test.ts, createReceipt.test.ts, extractEnqueue.test.ts, and several other receipts tests. Those bytes are JPEG markers, not a decodeable image. P02-T01 says hash input.processed if present else input.bytes on every SHA-256 miss, including first insert of a new row. P01-T02 validation allows hashing the same jpegBytes pattern. Details tell the implementer to skip a corrupt sibling or fail the create loudly, preferring skip-that-row, and not to treat hash failure as distance 0 — but they do not say what happens when the incoming buffer itself throws. perceptualHash.ts is specified to throw on invalid Hamming input; sharp-phash / sharp will throw on these stubs.
* Concern: If incoming hash failure fails the create, P02 breaks the locked regression suite and would force fixture rewrites far beyond the maximum-addition bound. If the throw is swallowed as a match, two stub inserts could false-merge. The P01-T02 jpegBytes option will fail the helper unit test for the same reason.
* Impact: P02 cannot land without either exploding the change surface or an unspecified error path. That is the main implementation trap in an otherwise bounded slice.
* Smallest useful change: In P01-T02, require a sharp-generated or fixture JPEG for perceptualHashOf tests; delete the receiptsRepo jpegBytes option. In P02-T01, lock: perceptualHashOf may throw; insertReceiptOriginal catches incoming decode/hash failure, inserts the row with perceptualHash null, and never treats null or a throw as a Hamming hit; sibling backfill failures skip that row only. Compare only 64-character 0/1 strings.
* Action owner: planning_parent
* Exact resolving evidence: P01-T02 names a valid JPEG source; P02-T01 states incoming-hash-failure equals insert with null hash; existing stub-JPEG receiptsRepo and createReceipt tests still pass after P02 without rewriting those buffers into real photos.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [Medium]: Insert-level tau 5/6 tests need a required seam

* Related IDs: NFR tau boundary; P02-T01 validation; P02-T02 optional helper; semantic coverage Hamming tau boundary
* Evidence: P01-T02 already unit-tests Hamming 5 within tau and 6 not. P02-T01 validation requires injected or real hashes at distance 0, 5, and 6 through insertReceiptOriginal. P02-T02 marks findNearestPerceptualMatch as optional. Production insert computes the hash from JPEG bytes; crafting two real JPEGs at Hamming exactly 5 and 6 is not available from supplied fixtures, and research says JPEG-re-encode folklore does not pin recapture distances.
* Concern: Without a required injection or pure nearest-match helper, the implementer cannot honestly test insert reuse at 5 vs insert at 6 except by loosening tau or by depending on recompress luck. Details already say do not loosen tau if recompress exceeds it and to use a synthetic hash seam instead — but that seam is not a P02-T01 target.
* Impact: The locked semantic bar for tau at create time can be dropped or faked. Distance 0 remains testable with two different originals sharing one processed buffer; 5 vs 6 does not.
* Smallest useful change: Make a tiny testable helper (findNearestPerceptualMatch, or injectable perceptualHashOf) a P02-T01 included target. Pin insert tests: distance 0 via different originals plus identical processed; 5 reuse and 6 insert via the helper or injected 64-character strings; real fixture recompress only as an extra if it stays within tau.
* Action owner: planning_parent
* Exact resolving evidence: P02-T01 likely targets include the helper or injection; receiptsRepo tests assert 5 reuses and 6 inserts without changing PERCEPTUAL_HASH_TAU.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Oldest-createdAt tie-break still unresolved

* Related IDs: P02; P02-T01; G3 fail closed
* Evidence: Plan FR says if any stored hash is within tau, return that existing row, with no winner rule when two rows both qualify. P02 unresolved items already propose oldest createdAt as stable and fail-toward-first-capture, and say document in T01, but P02-T01 unresolved items still list the tie-break as open. Tests may cover two stored neighbors is optional.
* Concern: Linear scan order is not a stable identity. Two leftover near-duplicates (the current failure mode this task reduces) can both fall within tau of a third recapture. Picking an arbitrary scan winner is non-deterministic and can change which bind or processed file is kept.
* Impact: Implementer may ship first-in-selectAll-order, which is not the stated first-capture preference and is hard to regression-test.
* Smallest useful change: Promote oldest createdAt (then id as a last resort) to required P02-T01 behavior and add it to T01 validation. Leave tests covering two stored neighbors as expected, not optional.
* Action owner: planning_parent
* Exact resolving evidence: P02-T01 boundaries include the tie-break; Unresolved Items no longer lists it; a receiptsRepo test with two in-tau neighbors returns the earlier createdAt.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: Processed-preferred vs original fallback is not a named P02 test

* Related IDs: FR pHash processed then original; locked semantic coverage processed vs original; P02-T01; C19
* Evidence: Plan functional requirements require tests covering processed-preferred vs original fallback. Locked semantic coverage repeats that. P02-T01 context states hash processed if present else first original, and do not include extra frames in pHash. T01 validation lists 0/5/6, SHA-256 first, writeProcessedIfAbsent, and ignored transactionId — not which buffer was hashed. Live attach always sends processed (receiptCaptureAttach.ts buildCreateReceiptBody). Existing create tests often omit processed and would hash the original after P02.
* Concern: An implementer can hash originals only, or hash originals even when processed is present, and still pass the listed T01 cases via injected strings. That misses the Scanic-crop identity the research selected and can fail recaptures whose originals differ but processed crops match (the actual user path).
* Impact: The capture-time layer can silently hash the wrong image and miss the recapture this task exists to catch, while still looking green on synthetic Hamming tests.
* Smallest useful change: Add a P02-T01 validation case: two different original bytes plus the same processed buffer reuse one id; processed-absent hashes the original; extraFrames do not enter pHash. Distance 0 via shared processed is the cheapest proof.
* Action owner: planning_parent
* Exact resolving evidence: A receiptsRepo test named in T01/T02 creates row A with original A plus processed P, then original B plus processed P, and expects the same id; a processed-absent pair with different originals inserts two rows unless their original hashes are within tau by injection.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-005 [Low]: P01 schema change compiles through one ReceiptRow literal

* Related IDs: P01-T01; locked maximum additions compile-forced schema typing; extractEnqueue.test.ts
* Evidence: ReceiptRow is ReceiptsTable. extractEnqueue.test.ts receiptRow() is the only exhaustive ReceiptRow object literal in the receipts feature; it lists every current column including contentHash. Adding perceptualHash: string | null to the table type fails that helper until the field is added. P01 likely targets list the migration, migrate.ts, receiptsSchema.ts, and maybe database.ts, not extractEnqueue.test.ts. Locked inputs already allow compile-forced schema typing and do not allow OpenAPI/DTO changes; toReceiptDto does not spread the row, so ReceiptDto stays unchanged.
* Concern: P01 typecheck can fail on a file the phase does not name. An implementer might delay the schema field until P02 or widen ReceiptDto by mistake.
* Impact: Small, mechanical, but it is the only compile break P01 will hit outside the named targets.
* Smallest useful change: Add extractEnqueue.test.ts to P01-T01 likely targets as a compile-forced perceptualHash: null on the ReceiptRow helper. Do not add perceptualHash to ReceiptDto or regenerate web-sdk.
* Action owner: planning_parent
* Exact resolving evidence: P01-T01 lists that test helper; tsc/backend build-checker passes with ReceiptDto unchanged.
* Decision route: direct planner correction

## Strengths and Residual Risk

* SHA-256-first reuse, UNIQUE content_hash race recovery, writeProcessedIfAbsent, ignored incoming transactionId, and pending-only extract kick are correctly treated as the persist contract to copy, not as matcher work. That matches receiptsRepo.ts insertReceiptOriginal and extractStoredReceipt.ts kickReceiptExtractIfPending.
* keep_both is honored. Research layer-3 field identity is follow-up UX, not auto-merge. Critique does not recommend adding vendor/date/total merge.
* API-only sharp hashing matches decoder-mismatch evidence (W15) and the Live POST that already sends processed. Web tasks correctly stay at zero.
* Nullable non-unique perceptual_hash is the right schema shape (collisions are the point; UNIQUE would be wrong).
* Tau 5 of 64 as a fail-closed default, with household recapture histograms as follow-up, is an explicitly accepted residual risk. Research Q3 confidence is medium for the number and low for thermal recapture. Missed recaptures stay two rows and keep matcher uniqueness conservative (C12). Critique does not ask to loosen tau.
* Concurrent near-duplicate creates can still insert two rows because perceptual_hash is not UNIQUE. Household volume and fail-closed make that an accepted residual.
* P01 shipping the column without populating it is a fine split if incoming hash policy is locked in P02; Kysely insert can omit a nullable column until P02 writes it.

## Questions or Blocking Evidence Gaps

* none. Fixture Hamming histograms remain deferred calibration, not a decision-critical gap. Incoming-hash policy, insert tau seam, tie-break, and processed-vs-original tests are planner-owned.

## Limitations

* Did not hash walmart.jpg, save-mart.jpg, or cameron-market.jpg; distinctness is assumed from different vendors plus the plan rule not to loosen tau. Did not execute tests or add sharp-phash. Did not prove Kysely Insertable omits nullable columns, but P01 can pass null explicitly if tsc requires it. Assessment does not reopen keep_both or matcher edits.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: planning_parent
* Smallest next action: Revise P01-T02 and P02-T01 so undecodable incoming JPEGs insert with perceptualHash null (never merge), hash-module tests use a real JPEG, and P02 locks the tau seam, oldest-createdAt winner, and processed-vs-original test. Then finalize the plan; do not re-run critique.
* User response required: no
