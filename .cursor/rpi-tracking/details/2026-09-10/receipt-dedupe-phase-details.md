<!-- markdownlint-disable-file -->
# RPI Phase Details: Receipt dedupe

## Metadata

* Task ID: RD-20260910
* Task slug: receipt-dedupe
* Related plan: .cursor/rpi-tracking/plans/2026-09-10/receipt-dedupe-plan.md
* Evidence sources: .cursor/rpi-tracking/research/2026-09-10/receipt-dedupe-research.md; .cursor/rpi-tracking/research/subagents/2026-09-10/perceptual-hash-js-subagent-research.md; docs/prds/receipt-taking.md; apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/data-persistence/migrate.ts

## Phase Index

| Phase ID | Name           | Status                   | Detail sections |
|----------|----------------|--------------------------|-----------------|
| P01      | Persist perceptual hash helper | complete | P01, P01-T01, P01-T02 |
| P02      | Reuse row on near-duplicate create | complete | P02, P02-T01, P02-T02 |

## Locked critique inputs

* Test ownership: API receipts feature and data-persistence migrate tests. Web has no tasks.
* Exact removals: none
* Maximum additions: one migration file, migrate.ts registry line, receiptsSchema field, perceptualHash module plus tests, findNearestPerceptualMatch helper (in perceptualHash.ts or a sibling), receiptsRepo plus tests, optional createReceipt test, extractEnqueue ReceiptRow literal field. No matchReceipts, lookupReceiptMatch, web, or OpenAPI DTO change unless a compile error forces schema-only typing.
* Canonical and generated targets: none. ReceiptDto does not gain perceptualHash in this task, so web-sdk regen is out of scope.
* Semantic coverage: Hamming tau boundary (pure and insert via findNearestPerceptualMatch); processed vs original hash input; SHA-256 still first; near reuse; far insert; two different fixtures stay two rows; reuse does not overwrite processed or transactionId; kick extract only if pending; incoming hash throw inserts with null hash; oldest createdAt then id wins in-tau ties.
* Regression coverage: existing receiptsRepo create/dedupe/processed tests including 6-byte JPEG stubs; createReceipt tests; extractEnqueue kickReceiptExtractIfPending tests; migrate.test registry equality. Stub JPEGs must still insert after P02.
* Validation evidence per completed Pxx, in order before the phase git commit: local-review on the phase slice (Critical, High, Medium, and simplifying Lows); build-checker backend; named tests below; verifier.

<!-- rpi:phase id=P01 -->
## P01: Persist perceptual hash helper

### Context

Receipts already have UNIQUE content_hash SHA-256 of original frames. Perceptual identity needs a separate nullable column because near-duplicates are not equal strings. migrate.ts uses an explicit registry; a new file that is not registered fails migrate.test. API already depends on sharp. Research selected 64-bit pHash on sharp pixels with tau 5 fail-closed.

### Intent

Ship the column and the hash/Hamming module without changing create reuse behavior yet, so P02 can call a tested helper.

### Boundaries

* Included: migration, schema type, registry, perceptualHash module, unit tests, pnpm add of sharp-phash or equivalent sharp-pixel pHash
* Excluded: insertReceiptOriginal compare, DTO fields, web, matcher, extract-key merge

### Likely Targets

* apps/api/src/data-persistence/migrations/2026-09-10-Receipt_Perceptual_Hash.ts: addColumn perceptual_hash text null
* apps/api/src/data-persistence/migrate.ts: register the migration
* apps/api/src/features/receipts/data/receiptsSchema.ts: perceptualHash: string | null
* apps/api/src/features/receipts/perceptualHash.ts: hash buffer, hamming, tau
* apps/api/src/features/receipts/__tests__/perceptualHash.test.ts: unit tests
* apps/api/package.json and pnpm-lock.yaml: pnpm add only

### Dependencies

* none

### Validation Expectations

* migrate.test.ts registers every migration file
* perceptualHash tests: identical 64-char strings distance 0; Hamming 5 is within tau; 6 is not; 64-length 0/1 strings; mismatched Hamming lengths throw; perceptualHashOf uses a sharp-generated or fixture JPEG (not Buffer.from([0xff, 0xd8, ...]) stubs)

### Completion Evidence

* Migration up/down compile; schema type used by AppDatabase receipts table
* Named tests: apps/api/src/data-persistence/__tests__/migrate.test.ts; apps/api/src/features/receipts/__tests__/perceptualHash.test.ts
* Fettra gates for P01

### Unresolved Items

* Exact npm package: sharp-phash is the research default (peer sharp >= 0.32). Implementer may hash sharp.raw pixels with an equivalent DCT pHash if sharp-phash fails on Windows Node 20; do not add canvas or jpeg-js as the stored-hash decoder.

<!-- rpi:task id=P01-T01 -->
### P01-T01: Migration, schema, and registry

#### Context

2026-08-29-Receipt_Tables.ts created content_hash NOT NULL UNIQUE. Perceptual hashes collide by design, so the new column is nullable text without UNIQUE. Existing rows stay null until P02 lazy backfill.

#### Intent

Add perceptual_hash / perceptualHash through the same Kysely camelCase path as contentHash.

#### Boundaries

* Included: addColumn, down dropColumn, schema field, MIGRATIONS entry
* Excluded: backfill in the migration (file I/O in migrate is out of scope)

#### Likely Targets

* apps/api/src/data-persistence/migrations/2026-09-10-Receipt_Perceptual_Hash.ts
* apps/api/src/data-persistence/migrate.ts
* apps/api/src/features/receipts/data/receiptsSchema.ts
* apps/api/src/data-persistence/database.ts only if receipts table typing is not fully derived from ReceiptsTable (it is imported; likely no extra edit)
* apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts: compile-forced perceptualHash: null on receiptRow(); do not add the field to ReceiptDto

#### Dependencies

* none

#### Validation Expectations

* migrate.test file-key equality
* Typecheck: ReceiptRow includes perceptualHash

#### Completion Evidence

* Registry test passes; TypeScript compiles against the new field

#### Unresolved Items

* none

<!-- rpi:task id=P01-T02 -->
### P01-T02: pHash and Hamming module

#### Context

Hacker Factor / McKeown JPEG-re-encode distances are not recapture proof. Plan pins PERCEPTUAL_HASH_TAU = 5 on a 64-bit 0/1 string. Hamming is a pure function. Hashing uses sharp. Do not mix jpeg-js.

#### Intent

One module receiptsRepo can import in P02.

#### Boundaries

* Included: export function perceptualHashOf(bytes: Buffer): Promise<string>; export function hammingDistance(left: string, right: string): number; export const PERCEPTUAL_HASH_TAU; export function isWithinPerceptualTau(distance: number): boolean
* Excluded: database I/O; finding a neighbor row

#### Likely Targets

* apps/api/src/features/receipts/perceptualHash.ts
* apps/api/src/features/receipts/__tests__/perceptualHash.test.ts

#### Dependencies

* P01-T01 schema is independent; this task may proceed in parallel inside P01

#### Validation Expectations

* Distance 0 for equal strings
* 5 within tau, 6 not
* Mismatched lengths throw
* Hash of a sharp-generated or fixture JPEG is 64 chars of 0/1. Do not use the 6-byte receiptsRepo jpegBytes stub as the perceptualHashOf input.

#### Completion Evidence

* Named perceptualHash.test.ts passing

#### Unresolved Items

* Package choice fallback recorded in P01 unresolved: sharp-phash vs in-module DCT on sharp pixels

<!-- rpi:phase id=P02 -->
## P02: Reuse row on near-duplicate create

### Context

insertReceiptOriginal already: hash frames, findReceiptByContentHash, return existing with writeProcessedIfAbsent, else write files and insert, recover UNIQUE races. Perceptual compare belongs after SHA-256 miss and before new id allocation. Winner persist contract must stay: no transactionId overwrite, no processed overwrite, kick extract only if pending (controller already uses kickReceiptExtractIfPending).

### Intent

Second photo of the same processed crop reuses the row immediately.

### Boundaries

* Included: compute hash, lazy backfill null hashes from processed file if present else original, linear Hamming scan, findNearestPerceptualMatch, oldest-createdAt-then-id winner, incoming hash failure inserts with null, reuse winner
* Excluded: matchReceipts changes, extract-key merge, DTO reused flag, web client hash, Practice session store

### Likely Targets

* apps/api/src/features/receipts/data/receiptsRepo.ts
* apps/api/src/features/receipts/perceptualHash.ts or findNearestPerceptualMatch.ts
* apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts
* apps/api/src/features/receipts/__tests__/createReceipt.test.ts if create path needs an extra assertion
* apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts only if reuse-of-gated behavior needs an extra case

### Dependencies

* P01

### Validation Expectations

* Named tests listed in P02-T02
* matchReceipts.ts, lookupReceiptMatch.ts, apps/web package.json not modified

### Completion Evidence

* Fettra gates for P02; phase git commit

### Unresolved Items

* none (oldest-createdAt-then-id is required in P02-T01)

<!-- rpi:task id=P02-T01 -->
### P02-T01: insertReceiptOriginal near-duplicate lookup

#### Context

Research C4/C6/C9/C24. Hash input is input.processed if present else input.bytes (first original). Do not include extra frames in pHash (contentHashOfFrames still covers multi-frame byte identity). Null perceptualHash rows: read processed or original bytes, compute, persist hash, then compare. perceptualHashOf may throw. Incoming decode/hash failure: catch, insert the new row with perceptualHash null, never treat null or a throw as a Hamming hit. Sibling backfill failures skip that row only. Compare only 64-character 0/1 strings. When two stored hashes are within tau, reuse the oldest createdAt, then lowest id. Existing 6-byte JPEG stub tests must still insert (they take the null-hash path).

#### Intent

SHA-256 miss then nearest within tau returns existing row.

#### Boundaries

* Included: lookup, backfill, insert perceptualHash on new rows, reuse persist semantics, findNearestPerceptualMatch helper, oldest-createdAt-then-id tie-break, incoming hash failure inserts with null
* Excluded: changing HTTP status 201; adding DTO fields

#### Likely Targets

* apps/api/src/features/receipts/data/receiptsRepo.ts
* apps/api/src/features/receipts/perceptualHash.ts or findNearestPerceptualMatch.ts
* apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts

#### Dependencies

* P01

#### Validation Expectations

* SHA-256 identical still returns same id without depending on pHash
* Distance 0: different original bytes plus identical processed buffer reuse one id (proves processed-preferred)
* Processed-absent hashes the original; extraFrames do not enter pHash
* Distance 5 reuse and distance 6 insert via findNearestPerceptualMatch (or injectable 64-character strings); do not change PERCEPTUAL_HASH_TAU to make recompress luck pass
* Two stored neighbors both within tau: returns the earlier createdAt (then lower id)
* Incoming undecodable JPEG (existing 6-byte stub) inserts with perceptualHash null and is not merged with a second stub
* Duplicate processed-absent then processed-present still writeProcessedIfAbsent
* Incoming transactionId on a hash hit is ignored

#### Completion Evidence

* receiptsRepo tests named in T02

#### Unresolved Items

* none

<!-- rpi:task id=P02-T02 -->
### P02-T02: Regression tests for enqueue, fixtures, and matcher isolation

#### Context

Two receipts sharing milliunits already refuse auto-bind. This task must not merge walmart.jpg with save-mart.jpg or cameron-market.jpg. Recompressing one fixture with sharp (different quality) is a valid near-duplicate if its pHash stays within tau; if recompress exceeds tau, use a synthetic hash seam rather than loosening tau.

#### Intent

Prove matcher isolation and fixture distinctness. Prove gated reuse does not enqueue.

#### Boundaries

* Included: tests; findNearestPerceptualMatch covered from P02-T01; fixture distinctness; stub-JPEG regression; gated reuse does not enqueue
* Excluded: editing matchReceipts.ts even to add comments about dedupe

#### Likely Targets

* apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts
* apps/api/src/features/receipts/__tests__/createReceipt.test.ts
* apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts

#### Dependencies

* P02-T01

#### Validation Expectations

* Named tests:
  * apps/api/src/data-persistence/__tests__/migrate.test.ts
  * apps/api/src/features/receipts/__tests__/perceptualHash.test.ts
  * apps/api/src/features/receipts/data/__tests__/receiptsRepo.test.ts
  * apps/api/src/features/receipts/__tests__/createReceipt.test.ts
  * apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts
  * apps/api/src/features/receipts/__tests__/matchReceipts.test.ts (regression only; file not edited)
* git diff does not include matchReceipts.ts, lookupReceiptMatch.ts, or apps/web/package.json

#### Completion Evidence

* Named tests pass; Fettra P02 gates; phase commit

#### Unresolved Items

* none beyond P01 package fallback
