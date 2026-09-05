<!-- markdownlint-disable-file -->

# Lane Research: Contrarian — own OpenCV.js pipeline vs wrap scanic/jscanify

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Contrarian |
| Lane | Challenge wrapping scanic/jscanify; compare owning @techstark/opencv-js + sharp (+ optional image-js warp) vs wrappers |
| Posture | expansive |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/contrarian-opencv-js-own-pipeline-subagent-research.md |
| Retrieval date | 2026-08-31 |
| Decision authority | none |

## Lane questions (answers below)

1. Is ~50-line Canny/findContours/approxPolyDP/warp via @techstark/opencv-js more honest for fail-loud than scanic?
2. Does canvas/jsdom in a headless API server have documented production pain (Windows canvas native compile)?
3. Can @napi-rs/canvas replace node-canvas for scanic/jscanify?
4. Size/startup: opencv-js 11.7MB vs jscanify 30MB vs scanic 296KB — acceptable for personal local API?
5. Counter-evidence that wrappers are still better (heuristics, glare v1.3, ML detector).

## Actions

1. npm registry dist.unpackedSize: scanic@1.6.0, @techstark/opencv-js@5.0.0-release.1, jscanify@1.4.3 (registry.npmjs.org, 2026-08-31).
2. Fetched scanic Node guide, scanic.d.ts@1.6.0, scanic package.json, scanic src/index.js and edgeDetection.js (github.com/marquaye/scanic, cdn.jsdelivr.net).
3. Fetched jscanify README, jscanify-node.js, jscanify.js, v1.3.0 release notes, wiki Getting started (github.com/puffinsoft/jscanify).
4. Fetched @techstark/opencv-js README, OpenCV.js Node tutorial, OpenCV smart-document-scanning blog recipe, opencv issue #27826 buffer vs DOM (docs.opencv.org, github.com/TechStark/opencv-js, github.com/opencv/opencv).
5. Fetched image-js getPerspectiveWarp API and tutorial (api.image-js.org, image-js-docs.pages.dev).
6. Fetched node-canvas Windows wiki and issue #2470; @napi-rs/canvas README and node-canvas.d.ts compatibility layer (github.com/Automattic/node-canvas, github.com/Brooooooklyn/canvas).
7. GitHub API: marquaye/scanic (61 stars), puffinsoft/jscanify (1771 stars).

---

## SUPPORT owning (wrap less)

- Own pipeline can fail loud on WASM init: @techstark/opencv-js requires awaiting onRuntimeInitialized; host code can throw if cv.Mat missing after init instead of continuing on a degraded tier — https://github.com/TechStark/opencv-js (Basic Usage).
- scanic documents and implements silent WASM→JS degradation: Node guide states "If the runtime can't run it, Scanic falls back to pure JavaScript automatically" — https://marquaye.github.io/scanic/guide/nodejs.html
- scanic initialize() is explicitly best-effort: "WASM is an optional accelerator… rejects, but the scanner still works via its pure-JS fallbacks, so we resolve instead of surfacing a fatal error" — https://raw.githubusercontent.com/marquaye/scanic/main/src/index.js (lines 29–38)
- Scanner.initialize() swallows WASM init failure (empty catch, marks initialized) — https://raw.githubusercontent.com/marquaye/scanic/main/src/index.js (lines 69–74); dist mirrors `try{await u()}catch{}` — https://cdn.jsdelivr.net/npm/scanic@1.6.0/dist/scanic.js
- scanic.d.ts documents useWasmFullCanny "Falls back to JS automatically without WASM" — https://cdn.jsdelivr.net/npm/scanic@1.6.0/src/scanic.d.ts
- edgeDetection.js logs console.warn and falls through to JS on WASM Canny/hysteresis/dilation failures — https://raw.githubusercontent.com/marquaye/scanic/main/src/edgeDetection.js (catch blocks ~636–720)
- Own ~50-line OpenCV recipe is a known, inspectable contract: OpenCV blog documents Canny → findContours → approxPolyDP largest quad → getPerspectiveTransform → warpPerspective — https://opencv.org/smart-document-scanning-with-live-ocr-using-opencv-js/
- jscanify findPaperContour is the same primitive stack (Canny, blur, threshold, findContours, largest area) — https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify-node.js; owning duplicates jscanify core without its v1.3 detection tweaks.
- Own geometry can avoid canvas/jsdom for Mat I/O: OpenCV Node tutorial shows Jimp bitmap → cv.matFromImageData; issue #27826 documents sharp.raw() → Mat.data.set with resize/normalize caveats — https://docs.opencv.org/4.5.4/dc/de6/tutorial_js_nodejs.html, https://github.com/opencv/opencv/issues/27826
- image-js getPerspectiveWarp + transform can warp given four corners but docs say automatic corner finding needs "something more advanced" — https://image-js-docs.pages.dev/docs/tutorials/applying-transform-function-on-images/; contour stage still required separately.
- Wrappers on Node still require canvas + jsdom shims: scanic official Node install is scanic + canvas + jsdom with global.document/ImageData — https://marquaye.github.io/scanic/guide/nodejs.html; jscanify-node.js installDOM() + require("canvas") on every construction — https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify-node.js
- node-canvas Windows install is documented as native-heavy (GTK 2 bundle, libjpeg-turbo, node-gyp) — https://github.com/Automattic/node-canvas/wiki/Installation:-Windows
- node-canvas on Windows commonly fails when prebuild 404s and Cairo headers missing (node-v127 example) — https://github.com/Automattic/node-canvas/issues/2470
- @techstark/opencv-js unpacked 14,731,296 bytes (~14.7 MB) vs jscanify 30,423,023 bytes (~29 MB) — npm registry 2026-08-31; owning drops bundled duplicate OpenCV inside jscanify.
- scanic engines.node >=22 — https://raw.githubusercontent.com/marquaye/scanic/main/package.json; host repo pins @types/node ^20.14.0 (package.json) — version tension if runtime is also <22.

## WEAKEN owning (wrappers still competitive)

- scanic is 295,767 bytes unpacked (~289 KB) vs @techstark/opencv-js 14.7 MB — npm registry 2026-08-31; personal local API tolerates either, but scanic cold footprint is an order of magnitude smaller.
- scanic ships tested multi-pass detection cascade (enableDetectionCascade default true): profiles connect-edges, no-dilation, fixed-mid-thresholds; candidate scoring with confidence, right-angle, contour-fit gates — https://raw.githubusercontent.com/marquaye/scanic/main/src/index.js (buildDetectionPassProfiles, shouldRunDetectionCascade, selectBestContourCandidate)
- scanic regression baselines on physical images (baseline:check, baseline:check:ml) — https://raw.githubusercontent.com/marquaye/scanic/main/README.md
- scanic optional ML detector (detector: 'ml') for cluttered/low-contrast photos; lazy ~2 MB CDN assets — https://raw.githubusercontent.com/marquaye/scanic/main/README.md, https://cdn.jsdelivr.net/npm/scanic@1.6.0/src/scanic.d.ts
- jscanify v1.3.0 adds glare suppression and multicolor-page detection inside findPaperContour; same API — https://github.com/puffinsoft/jscanify/releases/tag/v1.3.0
- scanic public API has no documented glare-suppression equivalent; ROADMAP still lists adaptive threshold/B&W as future — https://raw.githubusercontent.com/marquaye/scanic/main/README.md (comparison table only covers detection/warp)
- jscanify community maturity: 1771 GitHub stars vs scanic 61 — GitHub API 2026-08-31
- jscanify Node path is documented (loadOpenCV callback, few-second init noted as normal) — https://github.com/puffinsoft/jscanify/wiki/Getting-started#use-on-nodejs
- Naive own pipeline using largest-contour + minAreaRect corners (jscanify getCornerPoints) is weaker than scanic candidate scoring; approxPolyDP quad selection (OpenCV blog) is closer but still lacks scanic cascade / jscanify v1.3 glare work.
- OpenCV.js official Node path still recommends canvas/jsdom for cv.imread/cv.imshow — https://docs.opencv.org/4.5.4/dc/de6/tutorial_js_nodejs.html; fully canvas-free own stack needs sharp Mat bridge discipline (issue #27826).
- @napi-rs/canvas offers documented node-canvas compatibility import path — https://github.com/Brooooooklyn/canvas/blob/main/node-canvas.d.ts (`@napi-rs/canvas/node-canvas`); zero system deps on Windows — https://github.com/Brooooooklyn/canvas
- Neither scanic nor jscanify documents @napi-rs/canvas; jscanify hard-requires package name `canvas` — https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify-node.js; drop-in unverified for wrappers.
- Fail-loud on "no paper" is not automatic for any stack: scanic returns success:false; jscanify extractPaper returns null — https://raw.githubusercontent.com/marquaye/scanic/main/src/index.js, https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify-node.js; owning only wins if host throws on empty quad by design.
- jscanify wiki: OpenCV load "may take a few seconds" — acceptable for personal local API batch receipt prep — https://github.com/puffinsoft/jscanify/wiki/Getting-started#use-on-nodejs

## Question verdicts (evidence-only, no recommendation)

| Question | Verdict |
|----------|---------|
| Q1: Own opencv-js more fail-loud than scanic? | Partially yes for WASM tier (scanic silently degrades); no automatic win on detection miss; naive recipe ≈ jscanify, not scanic cascade. |
| Q2: canvas/jsdom production pain on Windows? | Yes, documented for node-canvas (native GTK/Cairo/prebuild gaps). Wrappers need it on Node; own pipeline can reduce canvas to optional if sharp→Mat path used. |
| Q3: @napi-rs/canvas replace node-canvas? | Theoretically via compatibility layer; not documented/tested by scanic or jscanify; jscanify requires `canvas` module name. |
| Q4: Size acceptable personal local API? | Yes for all three; scanic ~289 KB, opencv-js ~14.7 MB, jscanify ~29 MB (npm unpacked 2026-08-31). Startup: jscanify/OpenCV.js multi-second WASM init documented. |
| Q5: Wrapper counter-evidence? | scanic cascade + baselines + optional ML; jscanify v1.3 glare; jscanify stars/community; both avoid maintaining custom heuristics. |

## Gaps

- No hands-on benchmark: opencv-js init latency vs scanic Scanner.initialize on Windows Node 20/22 in this repo.
- @napi-rs/canvas alias with scanic/jscanify not exercised; only API-surface evidence.
- jscanify v1.3 glare algorithm not source-traced (release notes only).
- scanic ML detector receipt-specific accuracy not measured against receipt fixtures.
- Host actual Node runtime version not pinned in repo engines field.
- opencv-js sharp→Mat path not validated against receipt-image-prep fixtures.

## Stop

Contrarian saturation for cycle 1: primary sources fetched for fail-loud semantics, canvas Windows risk, napi-rs compatibility surface, npm sizes, and wrapper heuristic/ML/glare counter-evidence. Further retrieval likely redundant unless implementation probes (@napi-rs/canvas alias, sharp→Mat receipt fixtures, Node 22 adoption decision) are requested.
