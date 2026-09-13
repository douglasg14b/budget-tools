<!-- markdownlint-disable-file -->
# RPI Changes: Receipt dedupe

## Metadata

* Task ID: RD-20260910
* Related plan: .cursor/rpi-tracking/plans/2026-09-10/receipt-dedupe-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-09-10/receipt-dedupe-phase-details.md
* Implementation date: 2026-09-10

## Execution Status

* Status: Complete
* Declared invocation scope: full_plan
* Completed scope markers: P01, P01-T01, P01-T02, P02, P02-T01, P02-T02
* All remaining active-plan markers: none
* Status basis: Both phases implemented, gated, and committed

## Execution Summary

Live create still SHA-256-dedupes identical originals. P01 added a nullable perceptual_hash column and a sharp pHash/Hamming helper. P02 reuses the existing Live row when a new create's processed (or original) pHash is within 5 bits of a stored hash, before extract. Undecodable JPEGs insert with a null hash and never merge. Vendor/date/total is not used to merge. matchReceipts is unchanged.

## Completed Work

### P01 perceptual hash helper

* Related phase or task: P01
* Files: apps/api/src/data-persistence/migrations/2026-09-10-Receipt_Perceptual_Hash.ts; apps/api/src/data-persistence/migrate.ts; apps/api/src/features/receipts/data/receiptsSchema.ts; apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/perceptualHash.ts; apps/api/src/features/receipts/__tests__/perceptualHash.test.ts; apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts; apps/api/package.json; pnpm-lock.yaml
* What changed and why: Schema and helper so P02 can compare Scanic crops without a second image decoder.
* Completion evidence: migrate.test and perceptualHash tests; typecheck
* Validation: local-review (P01 slice); build-checker pass; named tests pass; verifier pass
* Phase git commit: d30858e

### P02 create-time near-duplicate reuse

* Related phase or task: P02
* Files: apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/perceptualHash.ts; apps/api/src/features/receipts/__tests__/perceptualHash.test.ts; apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts
* What changed and why: After SHA-256 miss, hash processed JPEG (else original), linear-scan stored hashes with lazy null backfill, reuse oldest in-tau row. Fail closed on decode errors.
* Completion evidence: receiptsRepo tests for stubs, shared processed, extra frames, far crops, oldest neighbor, gated reuse, backfill, walmart vs save-mart; matchReceipts.test.ts unchanged and passing
* Validation: local-review findings applied except accepted residuals (household O(n) scan; concurrent near-dupes without UNIQUE); named tests 52 passed; API typecheck pass
* Phase git commit: 1559343

## Implementation-Time Plan and Detail Updates

### P01 insert writes perceptualHash null

* Reason: Typecheck required the new column on insert before P02 populated it.
* Plan effect: none beyond P01 schema typing already allowed.

### Local-review P02 residuals accepted

* Full-table Hamming scan at household volume (plan NFR).
* Concurrent near-duplicate creates can still insert two rows because perceptual_hash is not UNIQUE (critique residual).

## Validation Record

* P01 local-review: ran; Mediums about unused column deferred to P02; added format tests and tau negative guard.
* P01 build-checker: pass
* P01 named tests: pass
* P01 verifier: pass
* P02 local-review: ran; added backfill test, logging, oldest-in-tau single pass, return in-memory row; skipped UNIQUE/locking and ANN index as accepted residuals.
* P02 typecheck: pass
* P02 named tests: pass (52)

## Blockers and Material Decisions

* none

## Remaining Work

* none in the approved plan

## Follow-Up Items

* Possible-duplicate inbox UX when vendor/date/total match and hashes are far
* Practice session identity
* Optional reused DTO flag
* Household recapture Hamming histograms if tau 5 misses real Scanic recaptures

## Handoff

* Ready for review: yes
* Remaining markers: none
* Validation gaps: P02 verifier subagent not re-run after review fixes; named tests and typecheck passed after those fixes
