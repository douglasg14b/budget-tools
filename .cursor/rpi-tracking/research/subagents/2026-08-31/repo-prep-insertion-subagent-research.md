<!-- markdownlint-disable-file -->

# Lane: repo-prep-insertion — budget-tools receipt image prep insertion points

| Field | Value |
|-------|-------|
| Cycle | 1 |
| Wave | Wider |
| Parent artifact | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (not edited) |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/repo-prep-insertion-subagent-research.md |
| Posture | Expansive internal read of receipts pipeline |
| Status | Complete (cycle 1) |

## Lane inputs

* Topic: Receipt image cleanup — where a one-call cleanup module plugs into the existing prep/extract path without mutating stored originals.
* Questions: current prep steps; callers and frame handling; OpenRouter image format/size; pipeline directory layout; tests sensitive to output dimensions/colors; OpenCV/tesseract leftovers.
* Scope: repo-only; no web search.

## Actions (files read)

| Path | Purpose |
|------|---------|
| apps/api/src/features/receipts/pipeline/prepReceiptImage.ts | Prep implementation and exports |
| apps/api/src/features/receipts/pipeline/__tests__/prepReceiptImage.test.ts | Unit tests for prep dimensions/format |
| apps/api/src/features/receipts/extractReceipt.ts | Orchestrator; prep hook; vision wiring |
| apps/api/src/features/receipts/extractPreview.ts | Practice/ephemeral extract entry |
| apps/api/src/features/receipts/extractStoredReceipt.ts | Live stored-original extract entry |
| apps/api/src/features/receipts/createReceipt.ts | Live create; decode frames; persist originals |
| apps/api/src/features/receipts/data/receiptsRepo.ts | Original frame read/write; separation contract |
| apps/api/src/features/receipts/pipeline/receiptHeaderVision.ts | OpenRouter vision calls |
| apps/api/src/features/categorization/llm/openRouterClient.ts | Vision message shape (image_url data URLs) |
| apps/api/src/features/receipts/receiptLimits.ts | MAX_RECEIPT_FRAMES |
| apps/api/src/features/receipts/receiptsController.ts | HTTP extract-preview route |
| apps/api/package.json | sharp dependency version |
| docs/prds/receipt-taking.md | Prep before read AC (section 5.3) |
| apps/api/src/features/receipts/__tests__/extractReceipt.test.ts | Prep injectability; vision image assertions |
| apps/api/src/features/receipts/__tests__/extractReceipt.live.test.ts | Live extract through default prep |
| apps/api/src/features/receipts/__tests__/extractPreview.test.ts | Preview wiring (mocked extract) |
| apps/api/src/features/receipts/__tests__/extractStoredReceipt.test.ts | Stored extract wiring (mocked extract) |
| apps/api/src/features/receipts/__tests__/extractEnqueue.test.ts | Enqueue/kick (jpegDataUrl for create only) |
| apps/api/src/features/receipts/__tests__/renderReceiptFixture.ts | Live fixture PNG generator |
| apps/api/src/features/receipts/__tests__/renderReceiptFixture.test.ts | Fixture raster assertions |
| apps/api/src/features/receipts/pipeline/__tests__/receiptHeaderVision.test.ts | Parser-only; no image bytes |
| apps/api/src/features/receipts/pipeline/arithmeticGate.ts | Listed for pipeline layout inventory |
| Grep: prepReceiptImage, jpegDataUrl, tesseract, opencv across repo | Call sites and legacy deps |

## Findings (path:line)

### prepReceiptImage — current steps and comments

* Public contract documents intent and deskew gap: JSDoc at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:12-14 states "Downsample, normalise contrast, and vertically stitch frames. Deskew is not applied." and "Returns JPEG bytes for OpenRouter — never the stored original."
* Max width constant: RECEIPT_PREP_MAX_WIDTH = 1280 at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:5.
* Entry prepReceiptImage at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:16-29: rejects empty frames (400); maps each frame through prepFrame; single frame returns that buffer; multiple frames call stitchVertically.
* Per-frame prepFrame at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:36-47: sharp pipeline is `.rotate()` (no explicit angle — EXIF auto-orient), `.normalise()` (contrast stretch), `.resize({ width: maxWidth, withoutEnlargement: true })`, `.jpeg({ quality: 80 })`. No crop, no perspective/deskew, no binarization/sharpen.
* Multi-frame stitch at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:50-90: align widths to max of frame widths; pad narrower frames via resize; composite vertically on white RGB canvas (channels: 3, background 255,255,255); output JPEG quality 80.
* jpegDataUrl helper at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:32-34: `data:image/jpeg;base64,` + base64 of buffer.
* PRD gap vs implementation: docs/prds/receipt-taking.md:116 requires "crop / deskew / contrast, stitch … downsample"; current code has contrast (normalise), stitch, downsample, EXIF rotate only — no crop or deskew.

### Who calls prep, with what frames, originals kept separate

* Single production call site of prepReceiptImage: defaultPrep at apps/api/src/features/receipts/extractReceipt.ts:196-197 delegates to prepReceiptImage({ frames }).
* extractReceipt orchestration at apps/api/src/features/receipts/extractReceipt.ts:80-91: `prep = input.prep ?? defaultPrep`; `processed = await prep(input.frames)`; `processedDataUrl = jpegDataUrl(processed)`; processed URL passed to vision only — input.frames (originals) are not sent to OpenRouter.
* Injectable prep hook at apps/api/src/features/receipts/extractReceipt.ts:56-56 and apps/api/src/features/receipts/extractReceipt.ts:83-84: ExtractReceiptInput.prep allows tests/alternate pipelines without touching stored files.
* JSDoc contract at apps/api/src/features/receipts/extractReceipt.ts:76-78: "Prep → cheap vision headers → … Processed bytes go to OpenRouter, not the stored original."
* Practice path extractPreview at apps/api/src/features/receipts/extractPreview.ts:8-20: decodes body.frames via decodeDataUrlFrame; calls extract({ frames }) with default extractReceipt — prep runs in memory; "writes no files or SQLite rows" per apps/api/src/features/receipts/extractPreview.ts:8-9.
* Live stored path extractStoredReceipt at apps/api/src/features/receipts/extractStoredReceipt.ts:22-34: readReceiptAllFrameBytes(id) then extract({ frames }) — originals read from disk each extract; no write-back of processed bytes in this module.
* Live create persists raw capture bytes: createReceipt at apps/api/src/features/receipts/createReceipt.ts:42-55 decodes data URLs to Buffers and insertReceiptOriginal writes them unchanged.
* Repo separation comment at apps/api/src/features/receipts/data/receiptsRepo.ts:188-190: readReceiptAllFrameBytes JSDoc — "Original frame bytes in capture order. Processed extract must not use these; prep first." (meaning: callers must prep before vision, not that this function prep's — it returns raw bytes).
* Original persistence at apps/api/src/features/receipts/data/receiptsRepo.ts:251-256: writeFile(originalPath, input.bytes) plus extra frame files; no processed-image path in schema.
* Frame limit shared by create and preview: MAX_RECEIPT_FRAMES = 8 at apps/api/src/features/receipts/receiptLimits.ts:3-4; enforced in extractPreview at apps/api/src/features/receipts/extractPreview.ts:18 and createReceipt at apps/api/src/features/receipts/createReceipt.ts:41.
* HTTP entry: receiptsController extractPreview at apps/api/src/features/receipts/receiptsController.ts:15 and apps/api/src/features/receipts/receiptsController.ts:116 delegates to extractPreview module (no additional prep).
* Web client: grep found no prep/deskew/crop in apps/web — all server-side prep today.
* Test proof originals ≠ vision payload: extractReceipt.test.ts:44-65 mocks prep, asserts completeJson receives jpegDataUrl(processed) not original bytes.

### Image format and size sent to OpenRouter

* Output format: JPEG quality 80 throughout prep at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:42,62,85.
* Max width: 1280 px default (height scales, no enlargement) at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:5,20-21,41.
* Color: 3-channel RGB through stitch canvas at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:80-81; normalise operates on color image before JPEG encode — not binary/grayscale output.
* Single stitched image for multi-frame captures at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:22-29.
* Encoding for API: jpegDataUrl at apps/api/src/features/receipts/extractReceipt.ts:85.
* Vision calls: readReceiptHeaders and readReceiptLines each pass images: [input.processedDataUrl] at apps/api/src/features/receipts/pipeline/receiptHeaderVision.ts:86 and apps/api/src/features/receipts/pipeline/receiptHeaderVision.ts:110 — same processed image for header and line extractions.
* OpenRouter wire format: openRouterUserContent maps images to image_url parts at apps/api/src/features/categorization/llm/openRouterClient.ts:120-124; completeOpenRouterJson sends user content array at apps/api/src/features/categorization/llm/openRouterClient.ts:168.
* No server-side resize/token math in repo — PRD notes vendor-specific image token formulas at docs/prds/receipt-taking.md:250 but code only enforces 1280px width cap.

### receipts/pipeline directory layout

* Production files under apps/api/src/features/receipts/pipeline/: prepReceiptImage.ts, receiptHeaderVision.ts, arithmeticGate.ts (3 pipeline-step modules; no index.ts barrel).
* Tests colocated: pipeline/__tests__/prepReceiptImage.test.ts, receiptHeaderVision.test.ts, arithmeticGate.test.ts per test-placement rule.
* module-directory-organization.mdc pattern: discrete pipeline steps live in pipeline/ — a new cleanup module would conventionally be a sibling file (e.g. cleanupReceiptImage.ts) rather than a new top-level receipts/ file, unless it subsumes the entire prep role.
* prepReceiptImage is the only image-bytes module in pipeline today; vision and arithmetic are downstream of prep output.

### Tests sensitive to prep output dimensions/colors

* prepReceiptImage.test.ts:15-20 — wide 2000px input must downsample to meta.width === RECEIPT_PREP_MAX_WIDTH (1280); format jpeg. Would fail if max width changes or cleanup alters width before resize.
* prepReceiptImage.test.ts:23-29 — two-frame stitch expects width 100 and height 70 (40+30) with maxWidth 100. Would fail if stitch order, alignment, or per-frame heights change (e.g. crop removing padding).
* prepReceiptImage.test.ts:32-33 — empty frames 400; behavioral, unlikely broken by cleanup.
* jpegDataUrl test at prepReceiptImage.test.ts:37-41 — encoding only; not dimension-sensitive.
* extractReceipt.test.ts — all cases mock input.prep; assert vision gets jpegDataUrl(mockProcessed) at extractReceipt.test.ts:64-65. Dimension/color changes to default prep do not break these unit tests.
* extractReceipt.live.test.ts — uses default prep via extractReceipt({ frames }) at extractReceipt.live.test.ts:67,101,112; asserts vendor/date/total behavior, not image metadata. Cleanup that changes vision readability could flake live tests without code changes.
* renderReceiptFixture.test.ts — tests PNG fixture renderer width >= 700 and dark pixel count; not prepReceiptImage output.
* extractPreview.test.ts, extractStoredReceipt.test.ts, extractEnqueue.test.ts — mock extract or use jpegDataUrl only for create payloads; not coupled to prep pixel output.
* No integration test asserts processed JPEG dimensions end-to-end through default prep except prepReceiptImage.test.ts.

### OpenCV / tesseract leftovers

* apps/api/package.json:19-32 — dependencies include sharp ^0.35.4 only for image processing; no tesseract, opencv, canvas, jimp.
* Grep apps/api/**/*.ts for tesseract|opencv — zero matches in application source.
* Historical tesseract.js documented only in .cursor/rpi-tracking artifacts (receipt-taking changes, plan, research); not present in workspace package.json files.
* extractReceipt payload field ocrPrintedMilliunits at apps/api/src/features/receipts/extractReceipt.ts:26-27 is legacy naming for line-vision printed total, not local OCR.

### sharp dependency

* apps/api/package.json:29 — "sharp": "^0.35.4" in dependencies (not devDependencies).
* All current prep operations are sharp-only at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:38-43,56-86.

## Insertion options (describe only; no selection)

### Option A — Per-frame cleanup inside prepFrame (before existing sharp chain)

* Add a sibling module (e.g. pipeline/cleanupReceiptImage.ts) exporting cleanupFrame(bytes) -> Buffer.
* Call from prepFrame at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:36-43 before or after .rotate(): crop/deskew/perspective on each frame, then existing normalise/resize/jpeg.
* Stitch at apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:50-90 unchanged — runs on already-cleaned frames.
* Originals untouched: prep still only consumes in-memory frames from extract callers; no repo writes.
* Fits multi-frame tape: each photo cleaned before vertical stitch.

### Option B — Per-frame cleanup inside prepFrame (after rotate, before normalise)

* Same as A but order: EXIF rotate first (apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:39), then cleanup (perspective often needs upright-ish input), then normalise/resize/jpeg.
* Preserves sharp.rotate() semantics for camera orientation before geometry correction.

### Option C — Orchestrator wrapper; prepReceiptImage stays resize/stitch-only

* New pipeline/cleanupAndPrepReceiptImage.ts composes cleanup per frame + calls existing prepReceiptImage or inlined stitch logic.
* defaultPrep at apps/api/src/features/receipts/extractReceipt.ts:196-197 switches to wrapper; prepReceiptImage.ts remains for tests and sharp-only behavior.
* Clear separation: cleanup module owns CV; prepReceiptImage owns downsample/contrast/stitch contract.

### Option D — Replace prepReceiptImage body with expanded one-call export

* Single public prepReceiptImage absorbs cleanup steps; same export name and call site at extractReceipt.ts:197.
* Lowest call-site churn; blurs "cleanup" vs "prep" in one file; harder to unit-test cleanup in isolation unless split internally.

### Option E — Inject via ExtractReceiptInput.prep only (no default change)

* Production would still need defaultPrep update for real effect; hook already exists at extractReceipt.ts:56,83 for tests and future A/B.
* Not sufficient alone for Live/Practice without changing defaultPrep.

### Option F — Post-stitch cleanup on single composite

* Run cleanup once on stitched JPEG/bitmap after apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:29.
* Simpler one geometry pass for single-frame receipts; multi-frame overlap/seam handling may be worse than per-frame cleanup before stitch.

### Option G — Cleanup between decode and prep at extract boundary

* extractReceipt.ts:84 could preprocess input.frames before prep — duplicates responsibility; extractReceipt.ts:76-78 documents prep as first pipeline stage, so prepFrame or defaultPrep is the conventional seam.

### Stored-original invariant (all options)

* createReceipt / insertReceiptOriginal write raw bytes at apps/api/src/features/receipts/data/receiptsRepo.ts:252-255.
* Processed buffers exist only in extractReceipt memory path at apps/api/src/features/receipts/extractReceipt.ts:84-85 until sent to OpenRouter — no code path writes processed JPEG back to originalPath.

## Gaps

* No server-side code implements crop or deskew today — only documented omission at prepReceiptImage.ts:13 and PRD at docs/prds/receipt-taking.md:116.
* No test covers default prep output size for real receipt photos (only synthetic solids in prepReceiptImage.test.ts and live behavioral tests).
* No processed-image artifact persisted for debugging/review — only originals on disk.
* OpenRouter model-specific image token sizing not implemented in code (PRD note only at docs/prds/receipt-taking.md:250).
* Whether cleanup should output color JPEG (current vision path) vs grayscale/binary not decided in code; current chain is color JPEG at prepReceiptImage.ts:42.
* Client capture preprocessing unknown in web — no matches in apps/web for receipt prep.
* extractReceipt.live.test.ts photographed fixtures (walmart.jpg, etc.) exercise full default prep but do not assert intermediate image geometry — regression signal for cleanup quality is behavioral only.

## Stop

* Cycle 1 wider lane: all listed source files read; call-site grep saturated (prepReceiptImage production caller is defaultPrep only; jpegDataUrl used in tests and as vision encoder).
* No apps/api OpenCV/tesseract code or deps remain.
* Pipeline layout and insertion seams documented with path:line anchors.
* Further cycles would only repeat unless new files land on branch or parent requests web/client capture lane.

## Evidence relationships

| Parent research question / claim | This lane evidence |
|----------------------------------|-------------------|
| Q8: Where would one-call cleanup plug in without changing stored originals? | Options A–G; invariant via receiptsRepo.ts:188-190,252-255 and extractReceipt.ts:84-85 |
| Current prep only EXIF rotate, normalise, resize, stitch; deskew deferred | prepReceiptImage.ts:12-14,36-47 |
| sharp already dep on Windows Node API | apps/api/package.json:29 |
| Extract sends processed JPEG data URL to OpenRouter vision (not originals) | extractReceipt.ts:84-90; receiptHeaderVision.ts:86,110; openRouterClient.ts:120-124 |
| PRD requires crop/deskew/contrast — partial implementation | docs/prds/receipt-taking.md:116 vs prepReceiptImage.ts:39-41 |
| tesseract.js removed; vision-first | no tesseract in apps/api; extractReceipt.ts:26-27 legacy field name |
| Prior deskew non-goal (2026-08-29 plan) | superseded at parent level; this lane confirms code still has deskew comment at prepReceiptImage.ts:13 |
| module-directory-organization: pipeline/ for steps | three existing siblings; cleanup would be fourth pipeline module unless replacing prepReceiptImage |

| Related lane (not run here) | Relationship |
|-----------------------------|--------------|
| External OSS / native binding lanes | Would choose cleanup implementation; this lane defines insertion API surface (per-frame Buffer in/out, before vision, JPEG out) |
| Web capture lane | Would determine whether client already crops before server prep |
