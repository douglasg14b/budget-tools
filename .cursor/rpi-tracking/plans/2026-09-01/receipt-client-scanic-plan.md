<!-- markdownlint-disable-file -->
# RPI Plan: Client Scanic receipt prep

## Task Metadata

* Task ID: RCS-20260901
* Task slug: receipt-client-scanic
* Planning status: ready
* Plan date: 2026-09-01
* Phase details: .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md
* Plan critique: .cursor/rpi-tracking/reviews/plans/2026-09-01/receipt-client-scanic-plan-critique.md

## Executive Summary

Capture will run Scanic in the browser on one photo, show the warped paper, and let you fix corners or reshoot before attach. Live still stores the raw shot. Extract and paid vision keep shrinking that confirmed Scanic JPEG to 1280px wide, so the preview can look sharper than the model’s input. Overlapping-tape stitch is not part of this work. Critique Revise findings are applied; the plan is implementation-ready at P01.

### User Decisions and Requirements Highlights

* Scanic on the device, with a visible warped preview, for solo use.
* One photo per receipt. Reshoot if the tape does not fit. Do not treat vertical JPEG stacking as a product.
* Original stored at capture size. Extract/vision still uses the existing 1280 width cap after Scanic.
* No Node scanic, jsdom, or canvas. WASM miss is loud.

### What You May Not Know

* Preview is the Scanic geometry at capture resolution. Extract still runs sharp rotate, normalise, and 1280 JPEG. What you approve is the crop, not the final pixel count.
* frames[] are all originals today. Processed must be a sibling artifact, not frame 1, or extract would stitch the table photo to the slip.
* Inbox burst is separate receipts (keepCameraOnAttach), not one long tape. That stays.
* Two full-size data URLs can hit the 15 MiB JSON body limit. The client blocks when JSON.stringify of the body would exceed 15728640 bytes (15 * 1024 * 1024), matching the API default. A custom RECEIPTS_JSON_BODY_LIMIT without a client redeploy is an accepted ops mismatch.
* This plan’s extract entry points use processed when present. Re-running extract from the raw original later is follow-up, not this plan.
* Camera snaps are already around video size. File uploads are the large originals.
* PRD stitch and “downsample as cost control” bullets stay open at the product-doc level. This plan cites them and does not rewrite the PRD.

### Unresolved Decisions or Blockers

* None. Stitch, downsample, and critique Revise items are locked.

For current user input, see [User Decisions and Requirements](#user-decisions-and-requirements). The planner keeps the synthesized sections below current as evidence and user direction evolve.

## User Decisions and Requirements

* Run Scanic on the capture device (camera snap or file upload), not in the Node API (caller 2026-09-01).
* Preview the warped output in the capture UI so the user can see whether Scanic did anything useful before attach (caller 2026-09-01).
* This app is personal/solo use; browser canvas and WASM are acceptable trade-offs (caller 2026-08-31 / 2026-09-01).
* Live still stores the original photo at capture size so a later replay can re-run against it. This plan’s extract entry points use the stored Scanic JPEG when present, then 1280 prep. Re-extract from originals is follow-up (caller original-saved; PC-004).
* Overlapping-tape stitch is out of this plan: one photo, Scanic preview, reshoot if the tape does not fit. Keep today's frames[] API as-is; do not treat crude vertical concat as a feature (caller 2026-09-01).
* Keep the 1280 width cap on the extract/vision path only. Preview may stay full-res even if extract later shrinks (caller 2026-09-01).
* Fail loud if Scanic WASM does not load. Do not silently fall back to the JS detector (root-cause-over-workarounds; research W42).
* Do not wait for Scanic to grow a Buffer / non-DOM API. ImageData / canvas in the browser is the integration surface.
* Prior research selected @techstark/opencv-js on the API. That selection is superseded for this task by client Scanic (caller 2026-09-01).

## Goals

* G1 After snap or upload, the reviewer sees a Scanic-warped preview and can confirm, recapture, or adjust corners before the receipt is created.
* G2 Live stores original bytes separately from the confirmed processed JPEG. Extract uses processed when present, then existing 1280 photometric prep. Legacy rows without processed still use original frames (including any extra files already on disk).
* G3 Geometry is owned by Scanic in apps/web. The API does not take a scanic, jsdom, or canvas dependency.
* G4 Missing WASM, a rejected or unusable detection, or an oversize JSON body is a loud failure, not a silent uncropped success.

## Scope and Non-Goals

### In Scope

* scanic in apps/web on the shared useReceiptCapture path (Classify card and inbox).
* Single-photo draft: snap or one file; reshoot replaces; optional Scanic corner editor.
* Upload contract: original frames plus a distinct processed JPEG.
* Persist processed beside the original file; GET {id}/image?variant=processed for Live overlay/inbox thumbs when hasProcessed.
* PracticeReceipt.processedPreview holds the Scanic data URL for Practice overlay/inbox thumbs.
* extractStored and extract-preview: processed buffer into prepReceiptImage (still 1280); else legacy all-original-frames stitch.
* WASM presence check with a loud capture error.
* Tests listed in Test Ownership.

### Non-Goals

* Node scanic, jsdom, node-canvas, or an OpenCV.js one-call module in apps/api.
* Real overlapping-tape alignment or new multi-snap capture UX.
* Removing extra-frame storage or MAX_RECEIPT_FRAMES from the API (compat for existing rows).
* Changing RECEIPT_PREP_MAX_WIDTH 1280, dropping normalise, or raising RECEIPTS_JSON_BODY_LIMIT.
* Client-side 1280 to make preview match extract.
* Multipart upload.
* Binarize, Scanic ML detector, 180-degree OSD, thermal curl dewarp.
* Replay / re-extract from originals while a processed file exists (needs a later source flag).

## Functional Requirements

* Capture runs Scanic on one still and shows the warped JPEG before attach.
  * Observable acceptance criteria: After snap or file pick, a processed preview is visible; attach is not the only way to learn whether crop happened.
* The reviewer can discard, reshoot (replace the draft), or edit corners when auto-detection is wrong.
  * Observable acceptance criteria: Discard clears; a new snap replaces the previous original and preview; Scanic corner editor can confirm a manual quad.
* No-quad without a confirmed manual quad does not attach as a successful prep.
  * Observable acceptance criteria: Detection failure is shown; attach stays blocked until corners are confirmed or the user discards.
* Live create stores original bytes and the confirmed processed JPEG as distinct artifacts.
  * Observable acceptance criteria: GET original remains the pre-Scanic photo; extract vision input is prepReceiptImage of the processed JPEG (1280 path).
* Overlay and inbox thumbs use the processed image when it exists (Live and Practice).
  * Observable acceptance criteria: After attach, Live slip/overlay uses GET variant=processed; Practice slip/overlay uses processedPreview, not frames[0].
* Practice extract-preview sends optional processed on ExtractPreviewDto (parallel to create) as extract input (still 1280 on the server) without SQLite.
  * Observable acceptance criteria: Practice attach still uses extract-preview; no Live row.
* WASM miss is a visible capture error and does not upload an uncropped stand-in as if prep succeeded.
  * Observable acceptance criteria: Error copy is shown; no receipt that looks successfully prepped.

## Non-Functional Requirements

* Combined create/extract-preview JSON stays within RECEIPTS_JSON_BODY_LIMIT (default 15 MiB).
  * Objective threshold or evaluation condition: Client refuses before POST when JSON.stringify of the create or extract-preview body would exceed 15728640 bytes. API still 413s if the env limit is lower.
  * Operating condition or verification approach, if needed: No silent extra downsample on the client.
  * Observable acceptance criteria: Failure is loud; preview is not replaced by a secretly smaller file.
* Scanic is a pnpm dependency of apps/web only.
  * Objective threshold or evaluation condition: apps/web package.json lists scanic; apps/api does not add scanic, canvas, or jsdom for this task.
  * Observable acceptance criteria: API package.json has no those additions.
* Existing 1280 extract cap remains.
  * Objective threshold or evaluation condition: prepReceiptImage tests that assert max width 1280 still pass.
  * Observable acceptance criteria: A wide processed JPEG is still 1280 wide after prep.

## Acceptance Criteria

* Snap or upload shows a Scanic-warped preview before attach; corners can be edited; reshoot replaces the draft.
* Live attach persists original and processed separately; extract uses processed then 1280 prep.
* Legacy receipts without processed still extract from original frames (stitch unchanged for those rows).
* Overlay/inbox thumbs prefer processed when present (Live variant=processed; Practice processedPreview).
* File picker is single-file; a second pick or snap replaces the draft.
* WASM miss and oversize body are loud.
* Capture UI is one photo; API frames[] limit unchanged.

## Test Ownership

Locked before critique. Implementers add or extend only these tests. Removals: none.

| Phase | Canonical targets | Tests (semantic) | Tests (regression) | Max new test files | Generated |
|-------|-------------------|------------------|--------------------|--------------------|-----------|
| P01 | apps/api receipts create, repo, extractStored, extractPreview, GET image | processed persist; extract prefers processed; GET variant=processed 200/404; create without processed still stitches originals; extractPreview with processed ignores extra frames | existing create/extract/repo tests; prepReceiptImage 1280 and stitch tests unchanged | 1 (only if a new processed-path helper is extracted; prefer extending receiptsRepo.test.ts, createReceipt.test.ts, extractStoredReceipt.test.ts, extractPreview.test.ts) | apps/api/src/generated/routes.ts and packages/web-sdk from TSOA |
| P02 | apps/web capture, Scanic wrapper, overlay/inbox image URL, PracticeReceipt | WASM-loud wrapper; single-draft original+processed attach payload; no-quad blocks attach; corner confirm allowed; Practice processedPreview thumb; client body length > 15728640 blocks before mutate; single-file replace | existing classify capture/practice tests; extend practiceReceipts.test.ts (not a new file) | 2 (Scanic wrapper under the new module __tests__; capture helper or useReceiptCapture __tests__) | none beyond consuming regenerated SDK types |

Validation evidence: colocated Vitest as above; Fettra local-review, build-checker, named tests, verifier per phase. Browser verification of snap, upload, corner edit, discard, reshoot, Live attach, Practice attach, Live and Practice inbox/overlay thumb in P02.

## Implementation Context Record

| Context item                     | Current artifact or record                                                                                                               |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Plan                             | .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md                                                                             |
| Phase details                    | .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md                                                                  |
| Latest critique                  | .cursor/rpi-tracking/reviews/plans/2026-09-01/receipt-client-scanic-plan-critique.md Revise applied in Critique Disposition; no second critique |
| Relevant research                | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (geometry; Node OpenCV.js selection superseded) |
| Changes-record role              | .cursor/rpi-tracking/changes/2026-09-01/receipt-client-scanic-changes.md is created or continued by implementation as its evidence record       |
| Planning execution and readiness | Execution: complete for declared P02. Readiness: P01 and P02 complete. |
| Continuation context             | Declared scope P02 complete. Full plan markers have completion evidence. |

## Sources

* Caller 2026-09-01: client Scanic; preview; stitch out; keep 1280 on extract only.
* docs/prds/receipt-taking.md: Prep before read, original saved, replay, one-receipt-many-frames (left undone), extract cost NFR.
* .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md: Scanic API, silent WASM fallback, no Buffer API.
* apps/web/src/components/review/classify/useReceiptCapture.ts: snap JPEG 0.92; MAX_RECEIPT_FRAMES drafts; Live create vs Practice extract-preview.
* apps/api/src/features/receipts/pipeline/prepReceiptImage.ts: 1280, normalise, stitch.
* apps/api/src/features/receipts/createReceipt.ts and data/receiptsRepo.ts: extra frames are extra originals; numbered sibling files.
* apps/web/src/components/review/classify/practiceReceipts.ts: PracticeReceipt.frames are originals; no processedPreview yet.
* apps/api/src/features/receipts/receiptsController.ts: GET {id}/image?frame= originals only; this plan adds variant=original|processed (default original).
* apps/api/src/environment.ts: RECEIPTS_JSON_BODY_LIMIT default 15 * 1024 * 1024.
* .cursor/rpi-tracking/plans/2026-08-29/receipt-taking-plan.md: multipart non-goal.

## Phase Checklist

<!-- rpi:phase id=P01 -->
### [x] P01: Persist processed separately and extract it at 1280

* Intent: Live receipts can store a Scanic JPEG beside the original. Extract and extract-preview use that buffer when present, then existing prepReceiptImage (1280). Legacy rows unchanged.
* Dependencies: none

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Store and serve processed bytes without using extra frames

* Requirement and evidence: G2; createReceipt extraFrames are originals; receiptsRepo numbered siblings.
* Expected result: Optional processed string on CreateReceiptDto writes a non-numeric sibling file; ReceiptDto.hasProcessed; GET {id}/image?variant=processed returns that file (404 if missing); variant=original (default) keeps frame=; content hash remains originals only; unlink deletes processed too.
* Detail section: P01-T01 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

<!-- rpi:task id=P01-T02 -->
#### [x] P01-T02: Extract prefers processed, then 1280 prep

* Requirement and evidence: Keep 1280 on extract/vision; processed is what vision sees.
* Expected result: extractStoredReceipt and extractPreview run prepReceiptImage on [processed] when CreateReceiptDto.processed or ExtractPreviewDto.processed is set or a processed file exists; otherwise all original frames (legacy stitch). Current extract paths do not satisfy PRD Replay from originals. prepReceiptImage tests unchanged.
* Detail section: P01-T02 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

<!-- rpi:task id=P01-T03 -->
#### [x] P01-T03: TSOA and web-sdk for the new fields

* Requirement and evidence: CreateReceiptDto, ExtractPreviewDto, ReceiptDto, GET query; generated routes and SDK.
* Expected result: OpenAPI and packages/web-sdk include optional processed on CreateReceiptDto and ExtractPreviewDto, ReceiptDto.hasProcessed, and GET image query variant original|processed. Tests in Test Ownership pass.
* Detail section: P01-T03 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

<!-- rpi:phase id=P02 -->
### [x] P02: Scanic preview on one photo and attach both images

* Intent: Capture runs Scanic, shows warp, edits corners, attaches original plus processed. Thumbs use processed. WASM and oversize fail loud.
* Dependencies: P01

<!-- rpi:task id=P02-T01 -->
#### [x] P02-T01: Scanic wrapper with loud WASM

* Requirement and evidence: pnpm scanic; research silent WASM-to-JS fallback.
* Expected result: apps/web depends on scanic. A small wrapper initializes the engine, refuses JS-only fallback, and exposes detect/extract plus a hook for confirmed corners. Unit tests mock scanic.
* Detail section: P02-T01 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

<!-- rpi:task id=P02-T02 -->
#### [x] P02-T02: Single-photo capture UI with preview and corner editor

* Requirement and evidence: G1; stitch-out; ClassifyReceiptCapture and useReceiptCapture.
* Expected result: One original plus one preview. File input is single (no multiple). pickFiles and snap replace the draft. Corner editor on bad quads. No-quad blocks attach until corners are confirmed. Draft counter “N of 8 frames” is not the Scanic happy path.
* Detail section: P02-T02 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

<!-- rpi:task id=P02-T03 -->
#### [x] P02-T03: Attach payload, thumbs, oversize, browser check

* Requirement and evidence: Live create processed field; Practice extract-preview; overlay/inbox imageSrc; 15 MiB limit.
* Expected result: Live POST includes frames (original) and processed. Practice extract-preview sends processed; PracticeReceipt.processedPreview is the overlay/inbox thumb. Live overlay/inbox use GET variant=processed when hasProcessed. Client blocks before mutate when JSON.stringify(body) exceeds 15728640. Browser verification listed in details.
* Detail section: P02-T03 in .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md

## Dependencies

* pnpm add scanic in apps/web (MIT; HTMLImageElement | HTMLCanvasElement | ImageData).
* Shared capture: ClassifyReceiptCapture, ReceiptsInbox, useReceiptCapture.
* prepReceiptImage 1280 + normalise + legacy stitch.
* TSOA generation and packages/web-sdk.
* RECEIPTS_JSON_BODY_LIMIT; no multipart.

## Critique Disposition

Record of .cursor/rpi-tracking/reviews/plans/2026-09-01/receipt-client-scanic-plan-critique.md (Revise). No second critique.

| Critique run and finding | Disposition | Plan response or residual risk |
|--------------------------|-------------|--------------------------------|
| PC-001 Practice thumbs | resolved | PracticeReceipt.processedPreview; P02-T03 and practiceReceipts.ts named; extend practiceReceipts.test.ts |
| PC-002 GET processed query | resolved | GET {id}/image?variant=original\|processed default original; frame= still applies to original |
| PC-003 ExtractPreview processed field | resolved | Optional processed string on CreateReceiptDto and ExtractPreviewDto in parallel |
| PC-004 Replay vs extract prefers processed | resolved | Current extract uses processed when present; PRD Replay from originals is Follow-Up |
| PC-005 Client 15 MiB source | resolved | Client constant 15728640 bytes; API env override without client redeploy is accepted ops mismatch |
| PC-006 Single-file picker | resolved | P02-T02: no multiple; pickFiles and snap replace |
| PC-007 WASM probe | accepted residual | Wrapper tests must fail attach on WASM miss; chosen probe recorded in the changes log |

## Follow-Up Items

* PRD “One receipt, many frames” overlapping-tape stitch remains undone. Owner: later plan if a tape does not fit in one shot.
* PRD downsample-as-cost-control: this plan keeps 1280 for extract but does not shrink the stored original or the preview. Product doc unchanged.
* PRD Replay: a later extract upgrade that re-runs against the saved original (or re-geometry) needs an explicit extract source parameter or temporary absence of processed. This plan’s extractStoredReceipt and extractPreview always prefer processed when present. Owner: later plan.
* Scanic ML detector, extra filters, real-time video: Scanic roadmap.
* 180-degree OSD and curl dewarp: deferred from 2026-08-31 research.
* Raising JSON body limit or multipart if full-res original plus processed routinely 413s. Owner: later, only after real files hit the limit.

## Handoff

* Implementation artifact: .cursor/rpi-tracking/changes/2026-09-01/receipt-client-scanic-changes.md
* Ready phase or task: none; P02 complete
* Remaining provisional question or blocker: none
