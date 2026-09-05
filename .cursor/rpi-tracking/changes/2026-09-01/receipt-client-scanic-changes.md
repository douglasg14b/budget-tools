<!-- markdownlint-disable-file -->
# RPI Changes: Client Scanic receipt prep

## Metadata

* Task ID: RCS-20260901
* Related plan: .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md
* Implementation date: 2026-09-01

## Execution Status

* Status: Complete (declared scope P02)
* Declared invocation scope: P02
* Completed scope markers: P02, P02-T01, P02-T02, P02-T03
* All remaining active-plan markers: none
* Status basis: P01 persist/extract/TSOA complete (`2efe696`). P02 Scanic capture, preview, attach, and thumbs implemented with named tests, typecheck, vite build, and local-review fixes. Browser click-through not run (no browser tools).

## Execution Summary

P01 stores an optional Scanic JPEG beside Live originals. P02 runs Scanic in the browser on one photo, shows the warp with a corner editor, and attaches original plus processed. Live and Practice thumbs use the processed image. WASM miss and oversize JSON fail loud.

## Completed Work

### Persist processed sibling and extract preference

* Related phase or task: P01 P01-T01 P01-T02 P01-T03
* Files: apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/createReceipt.ts; apps/api/src/features/receipts/extractStoredReceipt.ts; apps/api/src/features/receipts/extractPreview.ts; apps/api/src/features/receipts/receiptsDtos.ts; apps/api/src/features/receipts/receiptsController.ts; apps/api/src/generated/routes.ts; apps/api/generated/openapi.generated.json; packages/web-sdk/src/gen/types.gen.ts; colocated receipt tests
* What changed and why: Processed is `${originalPath}.processed`, not an extra frame. Extract uses it when present. OpenAPI/SDK expose processed, hasProcessed, and variant.
* Completion evidence: 29 named tests passed including processed persist, no overwrite on duplicate originals, extract prefers processed, preview ignores extra frames, GET variant helper 200/404. API typecheck passed. Local-review High/Medium applied except CHANGELOG (no changelog in repo) and HTTP-only GET test (covered via readReceiptImageBytes).
* Validation: named tests passed; local-review passed after fixes; build-checker and verifier subagent types unavailable on this host; API typecheck passed as substitute
* Phase git commit: 2efe696

### Scanic wrapper, single-photo capture, attach and thumbs

* Related phase or task: P02 P02-T01 P02-T02 P02-T03
* Files: apps/web/package.json; pnpm-lock.yaml; apps/web/src/scanic-exports.d.ts; apps/web/src/components/review/classify/scanicReceiptPrep.ts; apps/web/src/components/review/classify/receiptCaptureDraft.ts; apps/web/src/components/review/classify/receiptCaptureAttach.ts; apps/web/src/components/review/classify/useReceiptCapture.ts; apps/web/src/components/review/classify/ClassifyReceiptCapture.tsx; apps/web/src/components/review/classify/ClassifyReceiptCapture.module.css; apps/web/src/components/review/classify/practiceReceipts.ts; apps/web/src/components/review/classify/useReceiptOverlay.ts; apps/web/src/components/review/receipts/ReceiptsInbox.tsx; colocated `__tests__`
* What changed and why: Capture runs Scanic on one still, previews the warp, edits corners, and POSTs original plus processed. Overlay/inbox thumbs use processed. WASM `initialize()` null and JSON over 15 MiB refuse before mutate.
* Completion evidence: 17 named tests (wrapper success/WASM miss/no-quad; draft replace and stale-warp ignore; attach payload; 15728640 cap; Live variant=processed; Practice processedPreview). Web typecheck passed. `pnpm --filter @budget-tools/web build` succeeded (Scanic in the client bundle).
* Validation: named tests passed; local-review High/Medium applied; vite build passed as client-build substitute; browser click-through skipped (no browser tools in this session)
* Phase git commit: f2ac8f7

## Implementation-Time Plan and Detail Updates

### Dedup does not overwrite processed

* Affected plan area or markers: P01-T01
* What changed: Duplicate original hash writes processed only if absent (local-review High).
* Why: Same original with a later Scanic JPEG must not replace a stored warp without a new product decision.
* Triggering evidence: local-review High on insertReceiptOriginal existing path
* User answer or decision: none
* Reconciliation performed: tests added; plan intent preserved (hash originals only)
* Planning and critique state: not needed

### WASM probe is exported initialize()

* Affected plan area or markers: P02-T01
* What changed: Wrapper calls Scanic `initialize()`. Null means WASM did not load (JS fallback would run). Types omit this export; `apps/web/src/scanic-exports.d.ts` augments it. `Scanner.initialize()` is not used because it swallows WASM errors and still marks initialized.
* Why: Plan required a loud WASM gate and recording of the chosen probe.
* Triggering evidence: scanic 1.6.0 dist `export { IA as initialize }`; `async function IA(){try{return await u()}catch{return null}}`
* User answer or decision: none (implementer decision per PC-007)
* Reconciliation performed: unit test throws `SCANIC_WASM_MISSING_MESSAGE` when initialize resolves null
* Planning and critique state: not needed

### Stale corner warp cannot attach to a newer still

* Affected plan area or markers: P02-T02 P02-T03
* What changed: `extracted` events include the original they belong to; mismatched originals stay preparing. Attach is disabled while the corner editor is open. `confirmCorners` also checks prep generation after the async warp.
* Why: local-review High: a late extract after reshoot could pair the new photo with the old warp.
* Triggering evidence: local-review High on confirmCorners / attach-during-adjust
* User answer or decision: none
* Reconciliation performed: reducer test for stale original; canAttach false while editingCorners
* Planning and critique state: not needed

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| Named Vitest | P01 | Passed | 29 tests in receiptsRepo, createReceipt, extractStored, extractPreview, prepReceiptImage |
| API typecheck | P01 | Passed | pnpm --filter @budget-tools/api typecheck |
| local-review | P01 receipts | Passed | High overwrite fixed; TOCTOU fallback; preview comment; variant helper tests. Skipped CHANGELOG (no file). Skipped N+1 stat and frame-on-processed reject. |
| build-checker | P01 | Unavailable | Host Task enum has no build-checker subagent |
| verifier | P01 | Unavailable | Host Task enum has no verifier subagent |
| Named Vitest | P02 | Passed | 17 tests in scanicReceiptPrep, receiptCapture, practiceReceipts |
| Web typecheck | P02 | Passed | pnpm --filter @budget-tools/web typecheck |
| Vite production build | P02 | Passed | pnpm --filter @budget-tools/web build; Scanic bundled (ML chunk unused) |
| local-review | P02 apps/web | Passed | High stale-warp and attach-during-edit fixed. Medium: TextEncoder byte length; CSS-only Scanic theme; original not frames[] internally; cornerEditorOpen/canAttach. Skipped Low empty draftStatusCopy branch (exhaustiveness). |
| Browser click-through | P02 | Skipped | No browser automation tools in this session. Snap, upload, corner edit, discard, reshoot, Live/Practice attach and thumbs were not exercised in a real browser. |
| build-checker | P02 | Unavailable | Host Task enum has no build-checker subagent; vite build used as substitute |
| verifier | P02 | Unavailable | Host Task enum has no verifier subagent |

## Pre-Review Reconciliation

* Plan markers and phase details: P01 and P02 checked complete
* Completed-work evidence and handoff prose: P01 and P02 evidence above
* Validation, blockers, remaining work, and follow-up items: no remaining Pxx; browser click-through skipped; follow-up items unchanged in the plan
* Review readiness: ready for `@rpi-review` (browser verification remains a review concern)

## Blockers

* none

## Remaining Work

* none in the active plan. Browser click-through of snap/upload/corners/Live+Practice attach and thumbs was not run here.

## Follow-Up Items

* Canonical plan list: .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md, Follow-Up Items
* PRD stitch, replay from originals, Scanic ML, OSD, curl, body-limit raise — unchanged

## Return-to-Caller State

* Implementation execution status: Complete (P02)
* Declared scope and markers: P02 complete; remaining active-plan markers none
* Validation coverage: P02 named tests, typecheck, vite build, local-review; browser skipped; build-checker/verifier unavailable
* Blockers: none
* Current plan and detail updates: WASM probe initialize(); stale-warp original match
* Planning and critique state: ready plan; critique historical
* Follow-up items: as in plan
* Review readiness or no-handoff reason: ready for `@rpi-review`
* Continuation owner: user
