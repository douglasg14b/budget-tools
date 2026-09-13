<!-- markdownlint-disable-file -->
# RPI Plan: Receipt dedupe

## Task Metadata

* Task ID: RD-20260910
* Task slug: receipt-dedupe
* Planning status: ready
* Plan date: 2026-09-10
* Phase details: .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md
* Plan critique: .cursor/rpi-tracking/reviews/plans/2026-09-10/receipt-dedupe-plan-critique.md

## Executive Summary

Live receipt create already returns the existing row when original frame bytes are SHA-256 identical. A second phone photo of the same paper is a new JPEG, so it becomes a second row and then blocks bank auto-bind when the printed totals match. This plan adds a tight perceptual hash of the Scanic processed crop on the API create path so near-identical recaptures reuse the existing row immediately, without waiting for extract and without changing receipt-to-bank matching.

### User Decisions and Requirements Highlights

* Auto-dedupe recaptures; do not change how matching currently works.
* Immediate image identity at capture; parsed vendor/date/total is not a silent merge when photos differ.
* Keep both rows when extract keys match but photos are not close (two real same-total purchases).

### What You May Not Know

* Byte-identical SHA-256 already ships. The remaining gap is a second photograph, not a missing hash column for files.
* Duplicate receipt rows with the same printed total already prevent exact auto-bind. Missed dedupe is conservative; a wrong merge can create a false unique match.
* JPEG-re-encode Hamming folklore (0-5 bits) does not prove paper recapture. The plan uses a tight fail-closed tau on the Scanic crop and hashes only on the API with sharp so the browser does not use a second decoder.

### Unresolved Decisions or Blockers

* None. Critique PC-001–PC-005 applied. Hamming tau starts at 5 bits of 64. Undecodable JPEGs insert with perceptualHash null and never merge. Fixture recapture histograms remain follow-up.

For current user input, see [User Decisions and Requirements](#user-decisions-and-requirements). The planner keeps the synthesized sections below current as evidence and user direction evolve.

## User Decisions and Requirements

* Detect duplicate receipts so a second picture of the same paper does not create a second row (caller 2026-09-10).
* Do not mess up how receipt-to-bank matching currently works.
* Prefer an immediate fuzzy image hash at photo time if possible, rather than waiting for extract.
* Parsed vendor, date, amount (and similar fields) is a deterministic comparison, but when those keys match and the photos are not close, keep both rows (AskQuestion keep_both 2026-09-10).
* Auto-deduplicate image-confident hits (byte-identical or tight perceptual hash).
* PRD 5.1 Dedupe in docs/prds/receipt-taking.md: byte-identical and, if implemented, perceptually identical recaptures must not create a second receipt row.
* Before closing each Pxx Fettra gate set, run the local-review skill on that phase's working-tree slice. Before the phase git commit, fix Critical, High, and Medium findings, and Lows that simplify or improve consistency, quality, or duplication (standing receipt-taking decision). Then build-checker, named tests, and verifier.

## Goals

* G1 Reuse the existing Live receipt row when a create is byte-identical or perceptually the same processed crop, before extract runs.
* G2 Leave matchReceipts, Classify lookup, and extract gates unchanged.
* G3 Fail closed: uncertain image identity inserts a new row rather than merging two real purchases.

## Scope and Non-Goals

### In Scope

* API: nullable perceptual hash column, sharp-based 64-bit pHash of processed JPEG (fallback first original), Hamming compare on create, reuse existing row with the same persist semantics as SHA-256 hits.
* Lazy backfill of null perceptual hashes when scanning for a near duplicate so older rows can still match.
* Tests for Hamming, tau, SHA-256 still winning, near-duplicate reuse, far hashes inserting, bind/processed/extract enqueue semantics on reuse, processed-vs-original hash input, oldest-createdAt tie-break, and stub-JPEG insert with null hash.

### Non-Goals

* Silent merge on vendor + purchaseDate + printedMilliunits when photos differ.
* Possible-duplicate inbox UX.
* Changing matchReceipts auto-bind rules.
* Practice session identity.
* Browser-side hashing or a preflight endpoint to skip the 15 MiB POST.
* CNN/CLIP embeddings, PDQ, crop-resistant multi-hash.
* Exposing perceptualHash on ReceiptDto / web-sdk (not required for reuse).
* Rewriting docs/prds/receipt-taking.md beyond leaving the PRD as cited evidence (product checkbox update is follow-up if desired).

## Functional Requirements

* Live create SHA-256 hit still returns the existing row, does not overwrite processed if present, does not change transactionId, and kicks extract only when extractStatus is pending.
  * Observable acceptance criteria: existing receiptsRepo and createReceipt tests keep passing; new tests do not regress those cases.
* Live create SHA-256 miss computes a 64-bit pHash of the processed buffer when present, otherwise the first original frame, using sharp on the API. If that computation throws, insert the new row with perceptualHash null and do not perceptual-merge.
  * Observable acceptance criteria: new decodable rows persist perceptualHash; stub/undecodable JPEGs still insert; tests cover processed-preferred vs original fallback.
* If the incoming hash is a 64-character 0/1 string and the nearest existing stored (or lazily backfilled) perceptual hash is within PERCEPTUAL_HASH_TAU Hamming bits, return that existing row with the same reuse semantics as a SHA-256 hit. When two neighbors are within tau, reuse the oldest createdAt, then lowest id.
  * Observable acceptance criteria: distance 0 (shared processed, different originals) and distance 5 reuse the winner id; extract is not re-enqueued when the winner is not pending; two in-tau neighbors return the earlier createdAt.
* If the incoming hash is missing/null, the nearest Hamming distance is greater than tau, or no comparable 64-bit hash exists, insert a new row. Null never equals a hit.
  * Observable acceptance criteria: two different fixture receipts remain two ids; distance 6 inserts; undecodable incoming bytes insert with null hash.
* Do not call matchReceipts for receipt-to-receipt identity. Do not merge on vendor/date/total.
  * Observable acceptance criteria: matchReceipts.ts is not in the phase diff; no extract-key merge function is added in this task.

## Non-Functional Requirements

* Fail closed on uncertain identity.
  * Objective threshold or evaluation condition: merge only when Hamming distance is at most PERCEPTUAL_HASH_TAU (5 bits of a 64-bit hash) or SHA-256 matches.
  * Operating condition or verification approach, if needed: unit tests at tau boundary (5 merges, 6 does not).
  * Observable acceptance criteria: boundary tests pass.
* Single image decoder.
  * Objective threshold or evaluation condition: perceptual hash consumes sharp pixels in the API; no browser canvas/jpeg-js hash in v1.
  * Operating condition or verification approach, if needed: new dependency added with pnpm in apps/api only if needed; web package.json unchanged.
  * Observable acceptance criteria: no new web image-hash dependency.
* Classify miss path stays a cheap indexed read.
  * Objective threshold or evaluation condition: perceptual compare runs only on Live create, not on lookup-by-transaction.
  * Operating condition or verification approach, if needed: lookupReceiptMatch.ts and matchReceipts.ts unchanged.
  * Observable acceptance criteria: those files are not modified.
* Household-scale scan.
  * Objective threshold or evaluation condition: compare stored hash strings, not re-read every image, except lazy backfill of null hashes.
  * Operating condition or verification approach, if needed: repo tests with multiple rows.
  * Observable acceptance criteria: near-dupe lookup does not require listing image bytes for rows that already have perceptualHash.

## Acceptance Criteria

* Byte-identical recapture still returns one row.
* Two creates that share processed bytes (different originals) reuse one row when that processed pHash is within tau, and do not create a second extract.
* A processed JPEG whose pHash is farther than tau creates a new row. Undecodable incoming JPEGs create a new row with perceptualHash null.
* Two genuine different receipts (existing fixtures) are not merged.
* Receipt-to-bank matching code is unchanged.
* Vendor/date/total equality is not used to delete or reuse a row in this task.

## Implementation Context Record

| Context item                     | Current artifact or record                                                                                                               |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Plan                             | .cursor/rpi-tracking/plans/2026-09-10/receipt-dedupe-plan.md                                                                             |
| Phase details                    | .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md                                                                  |
| Latest critique                  | .cursor/rpi-tracking/reviews/plans/2026-09-10/receipt-dedupe-plan-critique.md with Revise findings PC-001–PC-005 applied; no second critique |
| Relevant research                | .cursor/rpi-tracking/research/2026-09-10/receipt-dedupe-research.md                                                                                          |
| Changes-record role              | .cursor/rpi-tracking/changes/2026-09-10/receipt-dedupe-changes.md is created or continued by implementation as its evidence record       |
| Planning execution and readiness | Complete; Ready                                                                                        |
| Continuation context             | rpi-quick parent continues to rpi-implement                                                                                                                              |

## Sources

* .cursor/rpi-tracking/research/2026-09-10/receipt-dedupe-research.md: layering, tau, sharp/pHash, G6 keep-both
* .cursor/rpi-tracking/research/subagents/2026-09-10/perceptual-hash-js-subagent-research.md: library and Hamming evidence
* docs/prds/receipt-taking.md: Dedupe requirement and collision NFR
* apps/api/src/features/receipts/data/receiptsRepo.ts: SHA-256 insert reuse contract
* apps/api/src/features/receipts/extractStoredReceipt.ts: pending-only extract kick
* apps/api/src/features/receipts/__tests__/matchReceipts.test.ts: two receipts same amount do not auto-bind
* apps/api/src/data-persistence/migrate.ts: explicit migration registry

## Phase Checklist

<!-- rpi:phase id=P01 -->
### [x] P01: Persist perceptual hash helper

* Intent: Add a nullable perceptual_hash column and a pure-plus-sharp module that can hash a JPEG buffer and score Hamming distance against tau 5.
* Dependencies: none

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Migration, schema, and registry

* Requirement and evidence: C3/C13 style column add; migrate.ts explicit registry; receiptsSchema.ts
* Expected result: New receipts rows can store perceptualHash null or a 64-character 0/1 string; migrate.test still matches files to MIGRATIONS.
* Detail section: P01-T01 in .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md

<!-- rpi:task id=P01-T02 -->
#### [x] P01-T02: pHash and Hamming module

* Requirement and evidence: Research Q3; sharp already in apps/api; pnpm add if using sharp-phash
* Expected result: perceptualHash.ts exports hash, hamming, tau, and isWithinTau; unit tests cover distance 0, 5, 6, and invalid length. perceptualHashOf tests use a sharp-generated or fixture JPEG, not the 6-byte receiptsRepo stub.
* Detail section: P01-T02 in .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md

<!-- rpi:phase id=P02 -->
### [x] P02: Reuse row on near-duplicate create

* Intent: SHA-256 miss then perceptual compare (with lazy backfill) reuses the existing Live row using the current duplicate persist contract.
* Dependencies: P01

<!-- rpi:task id=P02-T01 -->
#### [x] P02-T01: insertReceiptOriginal near-duplicate lookup

* Requirement and evidence: C4 C6 C9 C24 reuse semantics; hash processed then original; do not change transactionId or overwrite processed
* Expected result: Near hash hit returns existing id; far hash inserts; SHA-256 still short-circuits first; incoming hash throw inserts with null hash; oldest createdAt wins ties.
* Detail section: P02-T01 in .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md

<!-- rpi:task id=P02-T02 -->
#### [x] P02-T02: Regression tests for enqueue, fixtures, and matcher isolation

* Requirement and evidence: C9 C12 C18; create/enqueue tests; two different receipt fixtures must not merge
* Expected result: Named tests pass; matchReceipts.ts untouched; web package.json untouched.
* Detail section: P02-T02 in .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md

## Dependencies

* Existing SHA-256 content_hash unique path in insertReceiptOriginal: perceptual compare runs only after that miss.
* Scanic processed JPEG on Live create body: preferred hash input.
* sharp in apps/api: decoder for pHash.
* Explicit MIGRATIONS registry in migrate.ts: new file must be registered or migrate.test fails.
* Fettra phase git commit after each Pxx quality gate set.

## Critique Disposition

Record the latest critique findings, their disposition, and any explicitly accepted residual risk. Keep this section outside user decisions and current planning synthesis.

| Critique run and finding | Disposition                                        | Plan response or residual risk |
|--------------------------|----------------------------------------------------|--------------------------------|
| 2026-09-10 PC-001 incoming hash failure vs stub JPEGs | resolved | Incoming throw inserts with perceptualHash null and never merges; sibling backfill failures skip that row; P01-T02 uses a real JPEG |
| 2026-09-10 PC-002 insert-level tau 5/6 seam | resolved | findNearestPerceptualMatch is a required P02-T01 helper; 5 reuses and 6 inserts via 64-character strings |
| 2026-09-10 PC-003 oldest createdAt tie-break | resolved | Required winner: oldest createdAt, then lowest id; test with two in-tau neighbors |
| 2026-09-10 PC-004 processed vs original hash input | resolved | Required test: different originals plus same processed reuse one id; processed-absent hashes original |
| 2026-09-10 PC-005 extractEnqueue ReceiptRow literal | resolved | P01-T01 adds perceptualHash: null on the helper; ReceiptDto unchanged |
| Residual: tau 5 uncalibrated for thermal recapture | accepted | Misses stay two rows (conservative matcher). Household histograms remain follow-up |
| Residual: concurrent near-dupes can insert two rows | accepted | perceptual_hash is not UNIQUE; household volume |

## Follow-Up Items

* Possible-duplicate inbox UX when vendor/date/total match and perceptual hashes are far (user keep_both; not auto-merge).
* Practice session identity using the same pure Hamming helper.
* Optional ReceiptDto reused flag or HTTP 200 vs 201 distinction.
* Preflight hash probe to skip large POST (decoder must stay server-side or share sharp pixels).
* Household recapture Hamming histograms if tau 5 misses real Scanic recaptures.
* PRD 5.1 Dedupe checkbox update once byte and perceptual layers both exist.

## Handoff

* Implementation artifact: .cursor/rpi-tracking/changes/2026-09-10/receipt-dedupe-changes.md
* Ready phase or task: P01
* Remaining provisional question or blocker: none; tau 5 is an explicit accepted default until fixtures contradict it
