<!-- markdownlint-disable-file -->
# RPI Phase Details: Client Scanic receipt prep

## Metadata

* Task ID: RCS-20260901
* Task slug: receipt-client-scanic
* Related plan: .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md
* Evidence sources: .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md; docs/prds/receipt-taking.md; apps/web/src/components/review/classify/useReceiptCapture.ts; apps/web/src/components/review/classify/practiceReceipts.ts; apps/api/src/features/receipts/pipeline/prepReceiptImage.ts; apps/api/src/features/receipts/createReceipt.ts; apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/receiptsController.ts

## Phase Index

| Phase ID | Name | Status | Detail sections |
|----------|------|--------|-----------------|
| P01 | Persist processed separately and extract it at 1280 | complete | P01, P01-T01, P01-T02, P01-T03 |
| P02 | Scanic preview on one photo and attach both images | complete | P02, P02-T01, P02-T02, P02-T03 |

<!-- rpi:phase id=P01 -->
## P01: Persist processed separately and extract it at 1280

### Context

createReceipt decodes frames[] as originals. Extra buffers become numbered sibling files and extractStoredReceipt reads every frame into prepReceiptImage, which stitches. A Scanic JPEG must not be an extra original. GET {id}/image?frame= serves originals only today. This phase adds query variant=original|processed (default original). When variant=processed, frame is ignored. ReceiptDto gains hasProcessed. CreateReceiptDto and ExtractPreviewDto gain optional processed: string (data URL). prepReceiptImage still 1280-resizes whatever extract feeds it.

### Intent

New captures can persist a processed JPEG beside the original. Extract uses that JPEG when present, then the existing 1280 prep. Rows without processed keep today’s all-frames stitch.

### Boundaries

* Included: optional processed on create and extract-preview (same field name); sibling file not using numeric extra-frame names; DTO hasProcessed; GET variant=processed; extract branch; TSOA/SDK; tests in plan Test Ownership.
* Excluded: Scanic; capture UI; changing 1280; removing extra-frame API; multipart.

### Likely Targets

* apps/api/src/features/receipts/data/receiptsRepo.ts: write/read/unlink processed sibling; insert input field.
* apps/api/src/features/receipts/createReceipt.ts: decode optional processed data URL.
* apps/api/src/features/receipts/extractStoredReceipt.ts: prefer processed bytes.
* apps/api/src/features/receipts/extractPreview.ts: optional processed in body.
* apps/api/src/features/receipts/receiptsDtos.ts and receiptsController.ts: DTO and GET query.
* apps/api/src/features/receipts/__tests__/* and data/__tests__/receiptsRepo.test.ts.
* Generated routes and packages/web-sdk.

### Dependencies

* None.

### Validation Expectations

* Tests in plan Test Ownership for P01.
* prepReceiptImage.test.ts still asserts 1280 and stitch; do not rewrite those as processed-path tests.
* Fettra gates for the API slice.

### Completion Evidence

* Create with processed stores original and processed; extract of that id preps processed only (single frame into prepReceiptImage).
* Create without processed still stitches extras.
* GET {id}/image?variant=processed returns 200 with bytes or 404 when missing; variant=original default with frame= still works.
* SDK types include processed on create and extract-preview, hasProcessed, and variant query.

### Unresolved Items

* Exact sibling filename: `${originalPath}.processed` (id plus .processed). Must not collide with extraFramePath numbering (today originalPath and originalPath.1). Do not use a numeric extra index.

<!-- rpi:task id=P01-T01 -->
### P01-T01: Store and serve processed bytes without using extra frames

#### Context

insertReceiptOriginal writes originalPath = join(receiptsDir, id) and extras as extraFramePath. unlinkReceiptFiles must delete processed. contentHashOfFrames hashes originals only so a derived Scanic JPEG does not change dedupe identity.

#### Intent

Processed is a first-class file, not frame N.

#### Boundaries

* Included: insert/read/unlink/GET {id}/image?variant=original|processed (default original). When variant=processed, ignore frame. ReceiptDto.hasProcessed. CreateReceiptDto.processed optional string.
* Excluded: extract branching (P01-T02); OpenAPI generate step (P01-T03) beyond compiling controller signatures.

#### Likely Targets

* receiptsRepo.ts, createReceipt.ts, receiptsController.ts getReceiptImage variant query, receiptsDtos.ts ReceiptDto.hasProcessed and CreateReceiptDto.processed.

#### Dependencies

* None.

#### Validation Expectations

* receiptsRepo.test.ts and createReceipt.test.ts cover processed present/absent, hash ignores processed, GET variant=processed 200/404, GET variant=original still uses frame=.

#### Completion Evidence

* Tests named in Test Ownership for persist/GET.

#### Unresolved Items

* None.

<!-- rpi:task id=P01-T02 -->
### P01-T02: Extract prefers processed, then 1280 prep

#### Context

extractStoredReceipt currently extract({ frames: await readReceiptAllFrameBytes }). defaultPrep is prepReceiptImage (1280 + stitch). extractPreview maps all body.frames the same way.

#### Intent

When processed exists (stored file or preview body), prepReceiptImage receives that single buffer. Otherwise legacy frames. 1280 always applies.

#### Boundaries

* Included: extractStoredReceipt, extractPreview, tests. extractPreview uses body.processed when set, else legacy frames stitch. extractStoredReceipt uses the processed sibling when present for all current entry points (create kick, pending sweep). Does not implement PRD Replay from originals.
* Excluded: changing RECEIPT_PREP_MAX_WIDTH or stitch implementation; a replay/source flag.

#### Likely Targets

* extractStoredReceipt.ts, extractPreview.ts, extractPreview.test.ts, extractStoredReceipt.test.ts.

#### Dependencies

* P01-T01 file exists.

#### Validation Expectations

* Stored extract with processed does not concatenate original and processed.
* Preview with ExtractPreviewDto.processed set ignores extra original frames for vision input.
* Preview/create without processed keeps prior behavior.

#### Completion Evidence

* Those tests pass; prepReceiptImage tests untouched and passing.

#### Unresolved Items

* None.

<!-- rpi:task id=P01-T03 -->
### P01-T03: TSOA and web-sdk for the new fields

#### Context

CreateReceiptDto and ExtractPreviewDto only have frames[] today. Lock optional processed: string on both (data URL, parallel fields). GET image gains variant query. web-sdk is generated. P02 cannot send processed until types exist.

#### Intent

Regenerate OpenAPI/SDK so the web client can POST processed and GET processed images.

#### Boundaries

* Included: DTO fields processed on create and extract-preview, hasProcessed, GET variant, controller wiring already done in T01/T02, generate step, typecheck.
* Excluded: web capture implementation.

#### Likely Targets

* receiptsDtos.ts, receiptsController.ts, apps/api/src/generated/routes.ts, packages/web-sdk/src/gen/*.

#### Dependencies

* P01-T01, P01-T02 field names stable.

#### Validation Expectations

* Repo’s usual TSOA/sdk generate command succeeds; web-sdk types used by P02.

#### Completion Evidence

* Generated files committed in the P01 phase slice.

#### Unresolved Items

* None.

<!-- rpi:phase id=P02 -->
## P02: Scanic preview on one photo and attach both images

### Context

useReceiptCapture accumulates up to 8 JPEG data URLs, then Live Receipts.request2 create or Practice extract-preview. ClassifyReceiptCapture shows camera or picker and “N of 8 frames”. Snap draws the video to canvas (already Scanic-shaped). File pick is File to data URL. Overlay and inbox use frames[0] / GET original as thumbs. PracticeReceipt has frames only (originals). Scanic scanDocument accepts HTMLImageElement | HTMLCanvasElement | ImageData and can output canvas, imagedata, or dataurl. createCornerEditor needs a host HTMLElement. Scanner.initialize is the WASM hook; research records silent JS fallback if WASM missing.

### Intent

One photo through Scanic with a visible warp, then attach original plus processed. Thumbs show processed. Fail loud on WASM or oversize body.

### Boundaries

* Included: pnpm scanic on apps/web; wrapper; capture UX; attach; thumbs; oversize; browser verification.
* Excluded: API contract (P01); Scanic ML; client 1280; multi-snap stitch UX; Node scanic.

### Likely Targets

* apps/web/package.json via pnpm add.
* New wrapper beside classify capture (not a one-file util dump; keep Scanic I/O in one module used by useReceiptCapture).
* useReceiptCapture.ts, ClassifyReceiptCapture.tsx and module CSS.
* practiceReceipts.ts PracticeReceipt.processedPreview; useReceiptOverlay.ts; ReceiptsInbox.tsx imageSrc.
* New __tests__ per Test Ownership.

### Dependencies

* P01 SDK fields.

### Validation Expectations

* Unit tests in Test Ownership.
* Browser: snap, upload, corner edit, discard, reshoot, Live attach, Practice attach, Live inbox/overlay thumb is GET variant=processed, Practice inbox/overlay thumb is processedPreview.
* WASM-disabled or mock failure shows error and does not create a prepped-looking row.

### Completion Evidence

* Tests plus browser pass recorded in the changes log.

### Unresolved Items

* If Scanic’s public API has no WASM-loaded flag, the wrapper must fail by probing initialization (initialize then detect engine, or confirm the WASM module instantiated). Do not ship a path that continues on JS fallback. Record the chosen probe in the changes log. If the only probe is brittle, fail the whole capture with a clear error rather than guessing.

<!-- rpi:task id=P02-T01 -->
### P02-T01: Scanic wrapper with loud WASM

#### Context

scanic 1.6.x: scanDocument, extractDocument, Scanner, createCornerEditor. engines Node 22 is irrelevant in Vite. Bundler WASM was fixed upstream by inlining bytes.

#### Intent

One module owns Scanic calls and the WASM gate.

#### Boundaries

* Included: dependency, wrapper, unit tests with mocked scanic.
* Excluded: full capture UI.

#### Likely Targets

* apps/web package.json; new module under apps/web/src/components/review/classify/ or a receipts capture folder if capture files move together — prefer colocating with useReceiptCapture rather than a new top-level feature.

#### Dependencies

* None besides P01 types if the wrapper returns data URLs only (may not need SDK).

#### Validation Expectations

* Tests: success warp; WASM miss throws; no-quad returns a typed miss (not a fake full-frame extract).

#### Completion Evidence

* Wrapper tests pass for success, WASM miss (no attach), and no-quad typed miss. Record the WASM probe used in the changes log.

#### Unresolved Items

* WASM probe: same as P02 unresolved; implementer records the chosen probe. Not a planning blocker.

<!-- rpi:task id=P02-T02 -->
### P02-T02: Single-photo capture UI with preview and corner editor

#### Context

Draft is currently string[] of stills. Replace with one original data URL plus one processed preview (and optional live corner editor). Inbox keepCameraOnAttach still attaches one receipt then can open camera again for the next receipt.

#### Intent

Reviewer sees Scanic output before attach.

#### Boundaries

* Included: UI preview, corner editor mount, reshoot replaces, discard, no-quad blocks attach until confirm. ClassifyReceiptCapture file input is single (remove multiple). pickFiles takes the first file only and replaces the draft instead of appending up to MAX_RECEIPT_FRAMES.
* Excluded: POST wiring details that belong in T03 if they would duplicate; T02 may hold draft state that T03 sends.

#### Likely Targets

* ClassifyReceiptCapture.tsx, ClassifyReceiptCapture.module.css, useReceiptCapture.ts.

#### Dependencies

* P02-T01.

#### Validation Expectations

* Helper/UI tests for single draft, replace-on-second-pick, no-quad block. Browser in T03.

#### Completion Evidence

* Preview visible in UI; tests for state machine.

#### Unresolved Items

* None.

<!-- rpi:task id=P02-T03 -->
### P02-T03: Attach payload, thumbs, oversize, browser check

#### Context

Live create body is frames (originals) plus optional processed. Practice extract-preview sends ExtractPreviewDto.processed as the vision image and keeps frames as originals. Overlay currently uses receipt.frames[0] in useReceiptOverlay; inbox slipFromPractice uses frames[0]; Live inbox uses GET /api/receipts/{id}/image. After this task: Live thumbs GET {id}/image?variant=processed when hasProcessed; Practice thumbs use PracticeReceipt.processedPreview set in practiceReceiptFromExtract. Client named constant RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES = 15728640 (15 * 1024 * 1024) in the attach helper or a colocated capture module; refuse before POST when JSON.stringify(body) exceeds it. Do not share the API env module. Custom API RECEIPTS_JSON_BODY_LIMIT without a client redeploy is an accepted ops mismatch.

#### Intent

What was previewed (geometry) is stored as processed; extract still 1280s it. Thumbs match the preview crop. Oversize is loud.

#### Boundaries

* Included: attach mutations, PracticeReceipt.processedPreview, overlay/inbox imageSrc, oversize check, browser verification.
* Excluded: raising the body limit; a shared env package for the byte cap.

#### Likely Targets

* useReceiptCapture.ts attach; practiceReceipts.ts; practiceReceipts.test.ts; useReceiptOverlay.ts; ReceiptsInbox.tsx; generated SDK client.

#### Dependencies

* P01-T03, P02-T02.

#### Validation Expectations

* Tests: create/preview payload shape; Live thumb URL variant=processed when hasProcessed; Practice processedPreview when present; JSON.stringify body over 15728640 blocks before mutate.
* Browser list in P02 validation, including Practice overlay/inbox showing warp not frames[0].

#### Completion Evidence

* Browser and unit evidence in the changes log.

#### Unresolved Items

* None.
