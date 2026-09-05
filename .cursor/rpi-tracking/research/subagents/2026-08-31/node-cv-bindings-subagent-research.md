<!-- markdownlint-disable-file -->

# Lane Research: Node.js / npm / WASM / native CV bindings

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Wider |
| Lane | Node.js / npm / WASM / native CV bindings (crop, warp, threshold, CLAHE, rotate) on Windows |
| Posture | expansive |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/node-cv-bindings-subagent-research.md |
| Retrieval date | 2026-08-31 |

## Lane inputs

Host facts from parent brief:

- apps/api already depends on sharp ^0.35.4 (native libvips via Node-API; Windows prebuilds via @img/sharp-libvips-win32-x64).
- Runtime: Windows + pnpm + Node TypeScript API.
- Repo rule: native-addon / WASM load failures must be loud (no silent fallbacks masking missing binaries).
- Caller wants one self-contained module callable from the existing API.

Lane questions:

1. Catalog npm/WASM/native options and exact API coverage for receipt prep (contour/quad, warpPerspective/affine, rotation, adaptive threshold, CLAHE, morphology).
2. Windows install reality (prebuilds vs compile).
3. Can a Node-only stack implement document crop + perspective without OpenCV?
4. Size/startup cost: WASM OpenCV vs native.

## Actions

1. Read parent research brief for scope and constraints.
2. Verified apps/api/package.json sharp ^0.35.4.
3. Fetched sharp official operation API docs (sharp.pixelplumbing.com/api-operation/, api-resize/).
4. Queried npm registry metadata (npm view) for 16 packages on 2026-08-31.
5. Fetched GitHub latest-commit API for sharp, TechStark/opencv-js, UrielCh/opencv4nodejs, marquaye/scanic.
6. Reviewed OpenCV.js build/setup docs (docs.opencv.org js tutorials), libvips WASM blog, magick-wasm type definitions, image-js perspective-warp PR and API docs, scanic README/releases, opencv4nodejs-prebuilt-install npm page and GitHub issues.

## Findings table

| Package | npm last publish | GitHub last commit (API) | License | Binding type | Windows install reality | Contour / quad | warpPerspective / affine | Rotation | Adaptive threshold | CLAHE | Morphology | Notes |
|---------|------------------|--------------------------|---------|--------------|-------------------------|----------------|---------------------------|----------|-------------------|-------|------------|-------|
| sharp (existing dep) | 0.35.4 — 2026-08-26 | 2026-08-30 | Apache-2.0 | Native libvips (Node-API); prebuilt @img/* per platform | Excellent on Windows x64; optional deps ship win32-x64/ia32/arm64 libvips | No contours / findContours | affine() only (2×2 matrix); NOT 3×3 homography / warpPerspective | rotate(), autoOrient() | No — threshold() is global only | Yes — clahe({width,height,maxSlope}) | erode(), dilate() | Also: extract(), convolve(), modulate(), normalise(), sharpen(), trim() (border trim, not document detect) |
| wasm-vips | 0.0.18 — 2026-06-09 | (not fetched; repo kleisauke/wasm-vips) | MIT | WASM libvips (~4.8 MB vips.wasm per npm unpacked listing) | No native compile; WASM in package; author notes early development | No | libvips has affine-like ops; no OpenCV-style warpPerspective API surfaced same as sharp | Yes (libvips rotate) | Unclear in thin Node wrapper; libvips has threshold not adaptiveThreshold | libvips has CLAHE op | libvips morphology subset | Same engine family as sharp; ~5–45× slower than native sharp per libvips.org 2020 benchmarks |
| @techstark/opencv-js | 5.0.0-release.1 — 2026-06-24 (also 4.12.0-release.1 — 2025-11-08) | 2026-08-01 | Apache-2.0 | WASM OpenCV.js (~11.7 MB unpacked per npm) | No compile; async init (onRuntimeInitialized / Promise import pattern) | Yes — findContours, approxPolyDP, etc. (OpenCV.js surface; see cvKeys.json) | Yes — warpPerspective, getPerspectiveTransform | Yes — rotate, getRotationMatrix2D | Yes — adaptiveThreshold | Yes — CLAHE (createCLAHE) | Yes — erode, dilate, morphologyEx | Node requires non-browser load pattern (TechStark node example added 2025-04); imread needs Mat from buffer not DOM |
| opencv.js (official CDN) | N/A (not npm-first) | OpenCV upstream | Apache-2.0 | WASM / asm.js build | Same as opencv-js builds | Full CV | Full CV | Full CV | Full CV | Full CV | Full CV | @techstark/opencv-js repackages docs.opencv.org opencv.js builds |
| opencv-js-wasm | 5.0.0-alpha — 2025-11-02 | ttop32/opencv-js-wasm | Apache-2.0 | Single-file embedded WASM | npm install; loader returns Promise | OpenCV.js API | OpenCV.js API | OpenCV.js API | OpenCV.js API | OpenCV.js API | OpenCV.js API | Newer packaging; alpha channel |
| opencv-wasm (echamudi) | 4.3.0-10 — 2022-05-12 | Stale | BSD-3-Clause | WASM OpenCV 4.3 | Self-contained opencv.js + opencv.wasm | OpenCV 4.3 subset | Yes (older API) | Yes | Yes | Yes | Yes | Superseded by @techstark/opencv-js |
| @u4/opencv4nodejs | 7.1.2 — 2024-09-13 | 2026-01-21 | MIT | Native NAN binding + system/built OpenCV | Poor on Windows without VS Build Tools / Chocolatey OpenCV / long autobuild; no official prebuilds in package | Yes — full OpenCV | Yes | Yes | Yes | Yes (opencv2/xphoto or imgproc) | Yes | npm publish lags GitHub activity; install often fails on Node 22+ per community reports |
| opencv4nodejs (original) | 5.6.0 — 2022-05-12 | Abandoned | MIT | Native | Broken / deprecated | Yes if installed | Yes | Yes | Yes | Yes | Yes | README redirects to @u4 fork; issue comments say "dead" |
| opencv4nodejs-prebuilt-install | 4.1.209 — 2024-07-01 | udarrr repo | MIT | Native prebuild via prebuild-install | Windows x64 claimed; maintainer states Node only up to 20; NODE_MODULE_VERSION mismatches common (issues #12) | Yes (OpenCV 4.1 era) | Yes | Yes | Yes | Partial | Yes | Low downloads (~356/wk); stale vs current Node LTS |
| jimp | 1.6.1 — 2026-04-07 | jimp-dev org active | MIT | Pure JS | Trivial install | No document detect | No native perspective; plugin-displace only | rotate() | threshold() global | No | Limited (convolute) | Good for simple transforms; not document scanner |
| @alxcube/lens + jimp | 2.0.1 — 2023-12 | Low activity | (lens MIT) | Pure JS perspective/affine math | Easy | No — needs corner points | Yes — perspective via lens-jimp | Via jimp | Via jimp | No | No | Compose: detect corners elsewhere, warp with lens |
| image-js | 1.7.0 — 2026-07-08 | Active (perspective warp merged 2025-06) | MIT | Pure JS (+ optional native deps minimal) | Easy | Partial — cannyEdgeDetector, ROI/mask, getExternalContour; no turnkey document quad | getPerspectiveWarp() + transform() (3×3) since v1.7 | transformRotate | threshold(); no adaptiveThreshold | No dedicated CLAHE in API docs reviewed | open, close, dilate, erode on masks | Document pipeline possible but quad selection is DIY heuristics |
| @imagemagick/magick-wasm | 0.0.43 — 2026-08-25 | dlemstra/magick-wasm (fetch timed out) | Apache-2.0 | WASM ImageMagick 7 | WASM bytes in package; initializeImageMagick() | No findContours; edge() filter only | distort(DistortMethod.Perspective, params) | rotate | adaptiveThreshold(w,h,...) | clahe(xTiles,yTiles,...) | morphology via ImageMagick ops | Needs 4 corner points supplied; no automatic document boundary |
| scanic | 1.6.0 — 2026-08-12 | 2026-08-12 | MIT | Rust WASM core + JS warp (~100 KB gzipped claimed) | npm install; Node needs canvas impl (node-canvas) + jsdom per README | Yes — Canny/contour pipeline + optional ML detector | Yes — bilinear inverse-map warp | Implicit in extract | Roadmap: "Adaptive Thresholding" not yet (README checkbox) | No | dilate in WASM core | End-to-end document scanner without OpenCV; ML mode lazy-loads ~3.5 MB extra WASM |
| jscanify | 1.4.3 — 2026-07-20 | Active | MIT | JS wrapper over opencv.js | Pulls large OpenCV.js (~31 MB per scanic comparison table) | Yes (OpenCV inside) | extractPaper() | Via OpenCV | Via OpenCV | Via OpenCV | Via OpenCV | Not OpenCV-free despite small wrapper |
| opencv-document-scanner | 1.2.2 — 2025-09-11 | 2025-09-11 push | MIT | opencv.js wrapper | Same as opencv-js | detect(), crop() | Yes | Yes | Via OpenCV | Via OpenCV | Via OpenCV | Browser-first; Node possible with Mat buffers |
| @napi-rs/canvas | 1.0.8 — 2026-08-24 | Active | MIT | Native prebuild (NAPI-RS) | Good Windows prebuilds; not CV — rendering surface for WASM libs | N/A | N/A | N/A | N/A | N/A | N/A | Dependency for scanic/jscanify Node paths; separate native-addon risk |
| node-opencv | 0.0.2-security — 2022-05-11 | npm security placeholder | — | — | Do not use | — | — | — | — | — | — | Package removed / security advisory |
| python-shell | 5.0.0 — 2023-02-11 | extrabacon/python-shell | MIT | Node subprocess bridge | Requires Python + opencv-python installed on host | Via cv2 | Via cv2 | Via cv2 | Via cv2 | Via cv2 | Via cv2 | Not self-contained Node module; violates "one module" unless Python is a declared runtime prerequisite |

## sharp capability vs gap

### Confirmed APIs (sharp.pixelplumbing.com/api-operation/, api-resize/)

| Operation | API | Receipt-prep relevance |
|-----------|-----|------------------------|
| Rotate / deskew (known angle) | rotate(angle), autoOrient() | EXIF orientation; arbitrary-angle rotate with background fill |
| Crop (axis-aligned) | extract({left,top,width,height}) | Crop after corners known; not perspective crop |
| Affine (2×2) | affine(matrix, {background, interpolator, idx, idy, odx, ody}) | Skew correction limited to affine; cannot model full perspective (3×3 homography) |
| Global threshold | threshold(value, {greyscale}) | Binarize; not adaptive to local lighting |
| Convolve | convolve({width,height,kernel,scale,offset}) | Custom kernels (e.g. Sobel) but no contour extraction |
| Modulate | modulate({brightness,saturation,hue,lightness}) | Color/tonal adjustment for vision JPEG path |
| CLAHE | clahe({width,height,maxSlope}) | Local contrast enhancement |
| Morphology | erode(width), dilate(width) | Basic; not morphologyEx / opening-closing chains |
| Border trim | trim({background,threshold,lineArt,margin}) | Removes uniform borders; not document boundary detection |
| Sharpen / normalise | sharpen(), normalise() | Enhancement after geometry fixed |

### Confirmed gaps (no API in sharp docs/types reviewed)

- findContours / contour analysis / quadrilateral detection
- warpPerspective / 3×3 homography / four-point perspective rectify
- adaptiveThreshold (local window)
- Hough lines, Canny (unless hand-rolled via convolve + custom JS)
- Connected-component labeling

Implication: sharp alone can enhance and axis-aligned crop a receipt **after** corner geometry is supplied by another library or algorithm. It cannot own full document scan pipeline.

## Windows native-addon risk

| Package | Risk level | Failure mode | Mitigation notes |
|---------|------------|--------------|------------------|
| sharp | Low | Rare on win32-x64 if optional @img platform package stripped (see GrowthBook wasm-vips migration: --no-optional drops sharp prebuild) | Already in apps/api; verify pnpm does not omit optional deps in prod install |
| @u4/opencv4nodejs | High | node-gyp rebuild, OpenCV autobuild (cmake, git), EPERM on Windows, Node 21+ ABI issues | Chocolatey OpenCV + env vars; or disable autobuild — still fragile |
| opencv4nodejs-prebuilt-install | Medium–High | "library isn't connected", NODE_MODULE_VERSION mismatch (Node >20) | Maintainer capped Node 20; not aligned with modern Node 22 LTS |
| @napi-rs/canvas | Low–Medium | Prebuild miss on exotic arch | Needed if choosing scanic/jscanify on Node |
| WASM stacks (@techstark/opencv-js, wasm-vips, magick-wasm, scanic) | Low compile risk | Runtime init failure, OOM on large images, slow cold start | Fail loud on initializeImageMagick / cv init rejection; budget memory |

Repo alignment: treat missing native binary or failed WASM init as hard error at module load or first call — do not fall back to unprocessed image silently.

## Node-only document crop + perspective without OpenCV?

**Short answer:** Yes, but only with a **specialized document-scanner library** or a **multi-package DIY pipeline**. No single general-purpose image library (sharp, jimp, wasm-vips alone) covers detect + rectify.

### Paths that avoid OpenCV-branded deps

| Approach | Packages | What works | What is missing / cost |
|----------|----------|------------|------------------------|
| End-to-end scanner (recommended non-OpenCV lane) | scanic (+ node-canvas/jsdom on Node) | Contour detect, perspective extract, WASM core | Adaptive threshold on roadmap; Node needs canvas polyfill; optional ML assets ~3.5 MB |
| Compose: detect + warp | image-js OR magick-wasm + corner source | image-js: Canny/ROI/contour points + getPerspectiveWarp + transform; magick-wasm: distort(Perspective) if corners known | No production-grade receipt quad finder; custom heuristics required; slower than OpenCV/scanic |
| Compose: warp only | @alxcube/lens + jimp | Perspective warp given 4 points | Corner detection entirely external |
| sharp-only | sharp | Enhancement, axis-aligned crop, affine skew | Cannot detect document or full perspective |

### Paths that use OpenCV under another name

- jscanify, opencv-document-scanner → bundle/wrap opencv.js (WASM OpenCV).
- @techstark/opencv-js, opencv-js-wasm → direct OpenCV.js.

### What is missing for "sharp + friends" only

1. **Quadrilateral / document boundary detection** from arbitrary phone photos (the hard step).
2. **Perspective rectify** (3×3 homography) — sharp lacks warpPerspective; must use scanic, image-js transform, magick-wasm distort, or OpenCV.js.
3. **Adaptive binarization** — sharp has global threshold only; magick-wasm and OpenCV have adaptiveThreshold; scanic lists adaptive threshold as future work.

## Size / startup cost: WASM OpenCV vs native

| Stack | Approx. artifact size (npm unpacked / published) | Cold-start behavior | Processing speed (qualitative) |
|-------|--------------------------------------------------|---------------------|--------------------------------|
| sharp (native libvips) | Small JS shim + downloaded prebuild (~few MB platform binary) | Fast require(); no WASM init | Fastest in class for resize/enhance |
| @techstark/opencv-js | ~11.7 MB (npm registry) | Async module init; onRuntimeInitialized delay; community reports multi-second first load | Near-native CV ops once loaded; threads SIMD limited in Node per OpenCV docs |
| opencv-wasm (echamudi) | opencv.js + opencv.wasm bundled | Same family as opencv-js | Stale OpenCV 4.3 |
| wasm-vips | vips.wasm ~4.8 MB (+ variants) | await Vips() | libvips.org: ~8× slower JPEG vs sharp on benchmark PC |
| @imagemagick/magick-wasm | magick.wasm in package | initializeImageMagick(wasmBytes) | Heavier than sharp; full IM feature surface |
| scanic | ~100 KB gzipped core (author claim); ML optional +3.5 MB | Scanner.initialize() caches WASM instance | Author claims ~10 ms warp vs ~200 ms jscanify |
| @u4/opencv4nodejs | 10.8 MB package + system OpenCV or autobuild | Slow install; fast per-op after load | Native OpenCV speed if build succeeds |

OpenCV.js official build note (docs.opencv.org): default build bundles WASM base64 into one JS file; --disable_single_file reduces total size; thread optimization is browser-only, not Node.

## Provenance URLs

Primary sources only (retrieved 2026-08-31 unless noted):

- https://sharp.pixelplumbing.com/api-operation/
- https://sharp.pixelplumbing.com/api-resize/
- https://registry.npmjs.org/sharp/latest
- https://api.github.com/repos/lovell/sharp/commits?per_page=1
- https://registry.npmjs.org/@techstark/opencv-js
- https://github.com/TechStark/opencv-js
- https://api.github.com/repos/TechStark/opencv-js/commits?per_page=1
- https://techstark.github.io/opencv-js/
- https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html
- https://docs.opencv.org/4.x/dc/de6/tutorial_js_nodejs.html
- https://registry.npmjs.org/@u4/opencv4nodejs
- https://github.com/UrielCh/opencv4nodejs
- https://api.github.com/repos/UrielCh/opencv4nodejs/commits?per_page=1
- https://github.com/opencv/opencv/issues/23352
- https://registry.npmjs.org/opencv4nodejs-prebuilt-install
- https://github.com/udarrr/opencv4nodejs-prebuilt-install/issues/12
- https://registry.npmjs.org/opencv-wasm
- https://registry.npmjs.org/opencv-js-wasm
- https://registry.npmjs.org/wasm-vips
- https://www.libvips.org/2020/09/01/libvips-for-webassembly.html
- https://registry.npmjs.org/jimp
- https://registry.npmjs.org/image-js
- https://api.image-js.org/functions/index.getPerspectiveWarp.html
- https://github.com/image-js/image-js-typescript/pull/484
- https://registry.npmjs.org/@imagemagick/magick-wasm
- https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.42/dist/index.d.ts
- https://registry.npmjs.org/scanic
- https://github.com/marquaye/scanic
- https://api.github.com/repos/marquaye/scanic/commits?per_page=1
- https://registry.npmjs.org/jscanify
- https://registry.npmjs.org/opencv-document-scanner
- https://registry.npmjs.org/@napi-rs/canvas
- https://registry.npmjs.org/python-shell
- https://github.com/extrabacon/python-shell
- https://registry.npmjs.org/@alxcube/lens
- apps/api/package.json (sharp ^0.35.4)

## Gaps

- magick-wasm GitHub last-commit API fetch timed out; npm publish date 2026-08-25 used for maintenance signal only.
- No hands-on pnpm install benchmark on this Windows host for @u4/opencv4nodejs or scanic+@napi-rs/canvas in this cycle.
- opencv.js cvKeys.json not exhaustively enumerated; contour/warp/CLAHE claims for @techstark/opencv-js rely on OpenCV.js standard surface + package docs.
- image-js document-quad heuristic quality not benchmarked on receipt fixtures.
- scanic Node.js path (jsdom + canvas) not integration-tested in repo.
- Python-bridge lane (opencv-python subprocess) documented only as non-self-contained alternative; no PyPI version pin researched.

## Stop decision

Lane stop for cycle 1 / wider wave: **saturation reached** for npm/WASM/native catalog and Windows install posture. Primary registries, official sharp/OpenCV/libvips docs, and maintainer GitHub signals triangulated. Further cycles would duplicate unless parent requests hands-on Windows install matrix or receipt-fixture benchmarks.

## Evidence relationships

| Parent question | Lane finding | Relationship |
|-----------------|--------------|--------------|
| One self-contained Node module | Only scanic (non-OpenCV) or OpenCV.js / @u4 fork offer detect+rectify in one dep tree; sharp is enhance-only | **Constrains** stack choice: compose vs scanner lib |
| sharp already present | CLAHE, rotate, threshold, morphology partial — no warp/contour | **Supports** using sharp for post-geometry enhancement |
| Windows + loud native failures | sharp low risk; @u4/opencv4nodejs and prebuilt-install high risk; WASM avoids compile | **Supports** WASM/scanner over native OpenCV on Windows |
| Crop + perspective required | Node-only possible without OpenCV via scanic or DIY image-js/magick-wasm | **Answers** lane question with package names |
| OCR vs vision output | sharp/modulate/CLAHE suit color JPEG to vision; adaptive threshold in magick-wasm/OpenCV not sharp | **Relates** to parent color-vs-binary decision (parent owns) |
