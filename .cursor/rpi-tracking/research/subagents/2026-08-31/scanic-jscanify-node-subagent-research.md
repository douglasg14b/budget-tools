<!-- markdownlint-disable-file -->

# Lane Research: scanic vs jscanify (Node geometry stage)

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Deeper |
| Lane | Deep comparison of scanic vs jscanify (+ brief wascanner / opencv-document-scanner) for Node TypeScript on Windows as geometry stage of a one-call cleanup module |
| Posture | expansive |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/scanic-jscanify-node-subagent-research.md |
| Retrieval date | 2026-08-31 |

## Lane inputs

Host constraints from parent brief:

- apps/api is Node TypeScript on Windows; sharp already present.
- Caller wants one function owning crop / perspective / deskew geometry; enhancement may compose with sharp afterward.
- Vision path needs color JPEG after prep (not mandatory binarize at geometry stage).
- Repo rule: fail loud if native/WASM prerequisites missing (no silent masking).

Lane questions:

1. Exact public APIs, inputs/outputs (Buffer vs DOM/canvas).
2. Fail-loud contract when no paper found or runtime missing.
3. Node on Windows: loadOpenCV, canvas, jsdom, @napi-rs/canvas, WASM init, prebuilds, known install failures.
4. Bundle size: OpenCV.js ~30 MB vs scanic WASM ~100 KB + optional ML.
5. Enhancement overlap with sharp; scanic autoEnhance / receipt preset reality.
6. Maintenance: stars, last commit, license, downloads.
7. wascanner: real alternative or jscanify duplicate?
8. opencv-document-scanner vs jscanify overlap.

## Actions

1. Read parent research brief (scope, fail-loud rule, sharp/vision constraints).
2. Fetched npm registry pages and dist.unpackedSize for scanic@1.6.0, jscanify@1.4.3, wascanner@0.3.0, opencv-document-scanner@1.2.2 (npm view, 2026-08-31).
3. Fetched scanic official docs: API reference, Node.js guide, ML detection guide, ROADMAP.md (marquaye.github.io/scanic).
4. Fetched scanic.d.ts@1.6.0 (cdn.jsdelivr.net) and scanic package.json (engines node >=22).
5. Fetched jscanify wiki Getting started, npm README, source jscanify-node.js and jscanify.js (github.com/puffinsoft/jscanify).
6. Fetched wascanner npm README and GitHub API metadata (github.com/andor83/wascanner).
7. Fetched opencv-document-scanner npm README and document-scanner.ts source (github.com/tony-xlh/opencvjs-document-scanner).
8. Fetched GitHub API repo metadata for marquaye/scanic, puffinsoft/jscanify, andor83/wascanner, tony-xlh/opencvjs-document-scanner.
9. Cross-checked Rafcin/scanic fork README for autoEnhanceDocument / receipt preset claims (not in npm scanic@1.6.0).
10. Reviewed node-cv-bindings sibling lane for sharp overlap and canvas Windows risk notes.

## API comparison table

| Concern | scanic (marquaye/scanic@1.6.0) | jscanify (puffinsoft/jscanify@1.4.3) | wascanner (andor83/wascanner@0.3.0) | opencv-document-scanner (tony-xlh/opencvjs-document-scanner@1.2.2) |
|---------|--------------------------------|--------------------------------------|--------------------------------------|-------------------------------------------------------------------|
| Primary entry | scanDocument(image, opts?) Promise ScannerResult; extractDocument(image, corners, opts?); class Scanner { initialize(); scan() }; createCornerEditor (browser UI); initialize() warm-up | class jscanify { loadOpenCV(cb); findPaperContour(cvMat); getCornerPoints(contour); highlightPaper(image, opts?); extractPaper(image, w, h, cornerPoints?) } | WAScanner.load(assets?) then .detect / .highlight / .extract; WAScannerWorker async variants | class DocumentScanner { detect(source, {useCanny?}); crop(source, points?, w?, h?) } |
| scanDocument / extractPaper naming | scanDocument mode detect or extract; extractDocument for manual corners | extractPaper is the warp API (requires explicit resultWidth/resultHeight unless custom corners supplied) | extract(source, corners?, w?, h?) auto-detects when corners omitted | crop() wraps detect + warp; detect() returns corner points only |
| Accepted image types | HTMLImageElement, HTMLCanvasElement, ImageData (typed) | Browser: img/canvas/File; Node: canvas package loadImage() product (simulates HTMLImageElement) | ImageData, canvas, img, video, ImageBitmap (browser/DOM) | HTMLImageElement or HTMLCanvasElement only |
| Buffer input | No direct Buffer API; Node path uses canvas loadImage(path) or put ImageData from sharp raw | No direct Buffer; Node uses canvas loadImage | No Buffer; WASM expects RGBA pixels from DOM/canvas | No Buffer; cv.imread from img/canvas |
| Output types | ScannerResult.output: HTMLCanvasElement, ImageData, string dataurl, or null; corners CornerPoints {topLeft..bottomLeft} | HTMLCanvasElement from highlightPaper/extractPaper; findPaperContour returns OpenCV Mat or null | HTMLCanvasElement from highlight/extract; DetectResult {found, score, corners {tl,tr,br,bl}, width, height} | detect returns Point[]; crop returns HTMLCanvasElement |
| Output dimensions | Warp output size derived from detected quad geometry (no caller width/height required) | Caller must pass paperWidth and paperHeight to extractPaper (wiki examples use fixed 500x1000) | extract can omit w/h (uses detected width/height) | crop auto-computes width/height from corner distances when omitted |
| OpenCV dependency | None (Rust WASM Canny + JS/WASM warp) | Bundled opencv.js in src/opencv.js; Node loadOpenCV requires ./opencv module | None (Go wasm pipeline: grayscale, Otsu, morph, connected components, dewarp) | Requires global cv (window.cv); package does not bundle OpenCV |
| Enhancement APIs | None in public scanic.d.ts; ROADMAP lists adaptive threshold / B&W as future, receipt profile as idea only | None; v1.3.0 improved detection (glare suppression, multicolor pages) inside findPaperContour pipeline, not post-warp filters | None (geometry + overlay only) | None (geometry only) |
| autoEnhance / receipt preset | Not in marquaye/scanic@1.6.0 exports. Rafcin/scanic fork documents autoEnhanceDocument preset receipt — separate unpublished fork, not npm scanic | N/A | N/A | N/A |
| TypeScript | First-class scanic.d.ts shipped | No published types; JS only | TS library with dts | TS source (document-scanner.ts) |
| npm unpacked size (2026-08-31) | 295767 bytes (~289 KB) | 30423023 bytes (~29 MB) | 2177547 bytes (~2.1 MB incl. wasm) | 15672 bytes (~15 KB wrapper; + external opencv.js ~11–30 MB) |
| Runtime npm deps | 0 production deps | canvas ^3.2.3, jsdom ^29.1.1 (forced transitive install) | 0 production deps; vue peer for component entry | 0 production deps |
| Node documented | Yes — marquaye.github.io/scanic/guide/nodejs (scanic + canvas + jsdom globals) | Yes — wiki Use on Node.js; main entry jscanify-node.js | No Node guide; browser/camera oriented | No Node guide; constructor reads window.cv |
| License | MIT | MIT | MIT | MIT |

## Node/Windows deploy

### scanic

- Documented install: scanic + canvas + jsdom; set global.document, global.ImageData from JSDOM; loadImage from canvas (marquaye.github.io/scanic/guide/nodejs).
- package.json engines.node >= 22 (github.com/marquaye/scanic package.json).
- WASM: inlined in dist; Node guide states Buffer path when atob missing; initialize() is optional warm-up.
- WASM fallback: initialize() and Scanner.initialize() catch WASM failures and continue with pure-JS implementation (scanic source via cdn dist). This is graceful degradation, not fail-loud — conflicts with parent root-cause-over-workarounds rule unless wrapper treats JS-only as explicit tier or rejects.
- canvas (Automattic/node-canvas): native addon with Windows prebuilds when Node ABI matches; common failures when prebuild missing — compile via node-gyp, GTK deps, NODE_MODULE_VERSION mismatch (github.com/Automattic/node-canvas issues #1511, #2404). Official scanic Node guide names canvas, not @napi-rs/canvas.
- @napi-rs/canvas: not documented by scanic; compatibility unverified; jscanify hard-requires Automattic canvas in jscanify-node.js.
- ML mode (detector ml): lazy ~2 MB CDN fetch (model + minimal ORT wasm) on first use; Node supports threads per ML guide; optional self-host via scanic-ml package.
- Buffer to pipeline: typical pattern sharp -> raw RGBA -> ImageData, or canvas loadImage(Buffer) if encoded image bytes.

### jscanify

- Default npm export is jscanify-node.js which installDOM() via jsdom + maps Automattic canvas types to globals on construction.
- loadOpenCV(callback) loads bundled ./opencv and sets cv onRuntimeInitialized before callback (github.com/puffinsoft/jscanify src/jscanify-node.js). Must be called before findPaperContour/highlightPaper/extractPaper; calling early throws when cv undefined.
- OpenCV payload ships inside package (~29 MB unpacked); no separate CDN fetch at runtime in Node.
- canvas + jsdom are direct dependencies (not peer); every jscanify install pulls node-canvas native risk on Windows.
- Browser path uses jscanify/client or CDN plus external docs.opencv.org opencv.js async script.
- No documented @napi-rs/canvas support.

### wascanner (brief)

- Browser-first: WAScanner.load resolves wasm next to module; inputs are DOM/camera types; returns HTMLCanvasElement.
- No Node.js documentation; Go wasm + wasm_exec.js; ~2.1 MB package.
- Not a drop-in npm replacement for jscanify in Node API service without a headless canvas/wasm loader bridge (undocumented).

### opencv-document-scanner (brief)

- Browser-only constructor: throws Error OpenCV not found if window.cv missing (document-scanner.ts).
- Consumer must load opencv.js separately (README shows docs.opencv.org 4.8.0 script + onRuntimeInitialized).
- No Node path in README; porting to Node needs @techstark/opencv-js or similar plus DOM shims — same class of work as raw jscanify without bundled opencv.

### Windows canvas risk summary (both Node-capable geometry libs)

| Component | scanic path | jscanify path |
|-----------|-------------|---------------|
| Native compile risk | canvas (opt-in per Node guide) | canvas (forced dependency) |
| Large WASM/JS payload | ~289 KB base + optional ~2 MB ML | ~29 MB bundled opencv.js |
| Prebuild strategy | node-canvas prebuild-install per Node ABI | same |
| Known pain | Node 22+ without matching prebuild triggers source build (node-canvas #1511) | identical canvas issue plus multi-second OpenCV init |

## Fail-loud contract

| Library | No paper / bad detection | Missing runtime / init |
|---------|--------------------------|-------------------------|
| scanic | Resolves Promise; success false; message No document detected (or detection.message); corners null; output null; does not throw (scanic source + API reference marquaye.github.io/scanic/api/reference) | initialize() never rejects; WASM failure falls back to JS. Invalid image may reject from canvas ops — not uniformly documented. ML asset fetch failure surfaces via rejected scanDocument promise (inferred from async ML loader; exact message not fetched). |
| jscanify | extractPaper returns null when no contour and no custom cornerPoints (JSDoc in jscanify-node.js). highlightPaper always returns canvas (may show unmarked original). findPaperContour returns null. Does not throw on miss. | Methods before loadOpenCV: cv undefined → runtime throw. loadOpenCV itself does not error-callback on failure (only onRuntimeInitialized success path). |
| wascanner | detect returns { found: false, ... } (npm README API table) | load() promise rejection if wasm missing (typical wasm loaders; exact error strings not fetched) |
| opencv-document-scanner | detect always returns Point[]; if no contour maxContourIndex stays -1, code calls contours.get(-1) — undefined behavior / likely throw inside OpenCV.js (document-scanner.ts) | constructor throws OpenCV not found immediately |

Implication for one-call module with fail-loud requirement:

- None of the four libraries unify on throw-on-miss; scanic and wascanner use boolean flags; jscanify uses null canvas; opencv-document-scanner is weakest (may throw opaquely or return garbage corners).
- Wrapper must map success false / null / found false into typed loud failures for the host.
- scanic silent WASM→JS fallback conflicts with fail-loud unless wrapper probes WASM availability and rejects when required accelerator missing.

## Enhancement overlap

### marquaye scanic (npm)

- Public API is geometry only: detect corners, perspective extract, optional ML detector, corner editor UI.
- No autoEnhanceDocument, applyFilter, binarize, clahe, or receipt preset in scanic.d.ts@1.6.0.
- ROADMAP.md (github.com/marquaye/scanic): working on adaptive thresholding and B&W; maybe later output cleanup presets; ideas section lists receipt/ID/A4 detection profiles — not shipped.
- Rafcin/scanic fork (github.com/Rafcin/scanic) advertises autoEnhanceDocument presets including receipt, clahe, unsharp_mask, binarize — fork of marquaye repo, 0 stars, not published as npm scanic; do not treat as scanic@1.6.0 API.

### jscanify

- No post-warp enhancement APIs.
- v1.3.0 release: glare suppression and multicolor page detection improvements inside contour pipeline; API unchanged (github.com/puffinsoft/jscanify releases v1.3.0).
- README still lists glare suppression as feature; extraction output is color canvas from warpPerspective.

### sharp (existing host dep) — geometry-stage boundary

| Need | scanic/jscanify geometry libs | sharp (already in apps/api) |
|------|--------------------------------|-----------------------------|
| Perspective / homography | Yes (core value) | No warpPerspective |
| CLAHE / local contrast | Not in scanic public API; jscanify via OpenCV possible but not exposed | clahe({width,height,maxSlope}) |
| Sharpen | Not exposed | sharpen() |
| Global threshold / binarize | scanic roadmap only | threshold() global only |
| Color JPEG for vision | Both warp in color unless caller post-processes | modulate, normalise, jpeg() |

Recommended split for vision JPEG path: geometry library returns color warped bitmap (ImageData/canvas buffer) → sharp for CLAHE/sharpen/normalise/jpeg encoding. Binarize generally skip for OpenRouter vision per parent brief.

## Maintenance

| Package | Stars (GitHub API 2026-08-31) | Last push | npm weekly downloads (npm 2026-08-31) | License | Notes |
|---------|------------------------------|-----------|--------------------------------------|---------|-------|
| scanic | 61 | 2026-08-29 | 19720 | MIT | Created 2025-07; active releases through 1.6.0 (2026-08-12); 2 open issues |
| jscanify | 1771 | 2026-07-20 | 20657 | MIT | Mature since 2023; 81 forks; scanic credits jscanify as inspiration |
| wascanner | 0 | 2026-07-01 | 15 | MIT | Single burst (0.1.0–0.3.0 on 2026-07-01); describes self as WASM reimagining of jscanify |
| opencv-document-scanner | 73 | 2025-09-11 | 934 | MIT | Dynamsoft blog/demo oriented; 1.2.x released 2025-09-11 |

## wascanner vs jscanify

- Relationship: wascanner README explicitly positions as WASM (Go) reimagining of jscanify (github.com/andor83/wascanner). Algorithm is reimplemented (three segmentation strategies: color distance, edge-enclosed region, brightness blob) rather than wrapping jscanify.
- API: not compatible — WAScanner.load, detect/highlight/extract, DetectResult.found vs jscanify extractPaper null and corner naming tl/tr/br/bl vs topLeftCorner etc.
- Runtime: wascanner avoids OpenCV and node-canvas; jscanify requires both in Node.
- Maturity: jscanify has ~1.8k stars and ~20k weekly npm downloads; wascanner has 0 stars, ~15 weekly downloads, no Node docs.
- Verdict for Node Windows API geometry stage: wascanner is a conceptual sibling, not a maintained drop-in alternative; browser-only evidence as of 2026-08-31.

## opencv-document-scanner vs jscanify

- Overlap: same classic pipeline family — grayscale/threshold or Canny, findContours largest area, minAreaRect extreme corner points, getPerspectiveTransform + warpPerspective (compare jscanify.js and document-scanner.ts).
- Differences:
  - jscanify bundles opencv.js (~29 MB npm package); opencv-document-scanner is thin TS wrapper (~15 KB) requiring separate opencv.js load.
  - jscanify extractPaper returns null on miss; opencv-document-scanner detect does not guard empty contour index.
  - jscanify Node path mature (wiki, jscanify-node.js); opencv-document-scanner throws if window.cv absent — browser-first.
  - jscanify v1.3+ adds glare/multicolor detection tweaks; opencv-document-scanner offers useCanny option only.
  - opencv-document-scanner integrates Dynamsoft Document Viewer handlers (commercial viewer ecosystem).
- For Node receipt geometry: jscanify is closer to turnkey; opencv-document-scanner saves wrapper bytes but still pays OpenCV.js cost and needs porting work.

## Gaps

- No hands-on Windows install in budget-tools repo (per instruction: do not pnpm install in product repo). canvas prebuild compatibility with repo Node version unverified locally.
- @napi-rs/canvas as canvas substitute untested for scanic/jscanify DOM shims.
- Exact scanic rejection messages for corrupt buffers / ML CDN failure not captured verbatim.
- jscanify loadOpenCV failure modes (corrupt opencv bundle) not traced in issues this cycle.
- wascanner Node feasibility not proven — only absence of docs.
- opencv-document-scanner behavior when maxContourIndex === -1 not runtime-tested (static analysis suggests crash risk).
- Receipt-specific tuning: only Rafcin fork claims receipt preset; official scanic lists receipt profile as roadmap idea only.
- Performance benchmarks on receipt fixture images not run (marketing numbers only: scanic ~10 ms warp, jscanify ~200 ms per scanic README comparison table).

## Stop

- Primary-source pass complete for npm pages, official scanic docs, jscanify wiki/source, wascanner README, opencv-document-scanner source, GitHub API metadata, and bundle sizes.
- autoEnhance/receipt preset question resolved: not in npm scanic@1.6.0; fork-only.
- Fail-loud and enhancement boundaries documented with citations.
- Further fetches likely redundant unless parent requests live Windows install probe or receipt fixture benchmarks.

## Evidence relationships

- Supports parent criterion prefer maintained OSS: jscanify and scanic both MIT with 2026 npm activity; wascanner immature for Node.
- Supports parent Node-first constraint: scanic and jscanify have documented Node paths; wascanner and opencv-document-scanner browser-first.
- Supports parent fail-loud rule: all candidates need wrapper mapping; scanic WASM→JS fallback is explicit tension with fail-loud.
- Supports parent vision-color-JPEG path: geometry libs output color warp; enhancement remains sharp-owned per sibling node-cv-bindings lane.
- Contradicts treating scanic autoEnhance/receipt as available: only Rafcin fork README, not marquaye/scanic API.
- Related sibling artifact: .cursor/rpi-tracking/research/subagents/2026-08-31/node-cv-bindings-subagent-research.md (sharp gaps, WASM sizes, canvas Windows risk).
