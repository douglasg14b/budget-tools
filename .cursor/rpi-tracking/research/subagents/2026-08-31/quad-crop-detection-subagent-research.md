<!-- markdownlint-disable-file -->

# Lane Research: Quad / document corner detection and background crop

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Wider |
| Lane | Receipt/document bounding-box / quadrilateral detection and background crop |
| Posture | expansive |
| Status | Complete (cycle 1) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/quad-crop-detection-subagent-research.md |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |

## Lane inputs

- Target: phone photo of thermal/paper receipt on a table; detect paper quadrilateral in image coordinates suitable for homography (`cv2.getPerspectiveTransform` / `warpPerspective` or equivalent); fail loudly when no trustworthy quad.
- Host constraint (from parent): Node TypeScript API (`apps/api`), `sharp` already present; parent wants one-call prep module; root-cause rule requires loud failure when CV deps missing.
- Internal baseline: `prepReceiptImage.ts` only EXIF-rotate, normalise, downsample, stitch — no quad/deskew yet.
- Questions: installable quad-detection libraries; classical OpenCV pipeline maturity/failure modes; DL alternatives with detect-quad API; receipt-specific GitHub projects; confidence / fail-loud patterns.

## Actions

- Web retrieval 2026-08-31: npm/PyPI/GitHub READMEs, OpenCV/tutorial blogs, DocAligner docs, scanic/jscanify/quadscan source skim.
- GitHub API metadata for last-push dates and stars on key repos.
- npm registry version timestamps for Node packages.
- Read parent research brief and current `prepReceiptImage.ts` (no edits).
- Did not implement product code or edit parent artifact.

## Candidate approaches table

| Approach | Type | Install / API shape | Maturity (2026-08-31) | Corners + confidence / fail-loud | Failure modes (receipt-relevant) | Notes for parent |
|----------|------|---------------------|-------------------------|----------------------------------|----------------------------------|------------------|
| **Classical OpenCV pipeline** (grayscale → blur → Canny/adaptive thresh → morph → `findContours` → sort by area → `approxPolyDP` ε≈0.02·perimeter → require 4 vertices → `order_points` → homography) | Algorithm + tutorials; **not one packaged detector lib** | Raw OpenCV via `@u4/opencv4nodejs` (npm 7.1.2, modified 2024-09); Python `opencv-python`; browser `opencv.js` | **Very mature pattern** (2014–2026 tutorials); implementation quality varies; no standard confidence score | **Must be custom**: no quad → return error; validate convex quad, min area fraction, aspect ratio, corner order; optional contour score = area / image area | **Dark table**: weak edges; **clutter**: largest contour is table edge/object not receipt; **low-contrast thermal on beige**: Canny/threshold miss paper boundary; **curled receipt**: contour is not a planar quad — homography still runs but warps wrong; **approxPolyDP**: often >4 or <4 vertices (Stack Overflow 44254582) | Canonical copyable recipe; `imutils.perspective.four_point_transform` (Python PyPI `imutils`, GitHub PyImageSearch/imutils, pushed 2024-06) is **warp-only**, not detection. PyImageSearch 2014/2021 receipt scanner posts are primary citations. |
| **jscanify** | **Library** (npm `jscanify` 1.4.3, modified 2026-07-20; GitHub puffinsoft/jscanify, MIT, ~1.7k★, pushed 2026-07-20) | `findPaperContour(mat)` → `getCornerPoints(contour)` → `{topLeftCorner…}`; `extractPaper(…)` warps; **requires OpenCV** (`opencv.js` ~30MB browser or `loadOpenCV` on Node) | Active; v1.3+ claims better glare/multi-color paper | `extractPaper` **returns `null`** if no contour (documented); corners can be **partially undefined** (`getCornerPoints` wiki); **no numeric confidence** | Uses **largest contour + minAreaRect quadrant extrema**, not strict `approxPolyDP` 4-gon (source v1.4.0). Same classical failure modes; may “detect” non-rectangular largest blob. Recommends solid background. | Only Node-friendly **high-level quad API** among classical options; OpenCV payload/deploy cost is the blocker for API service. |
| **scanic** | **Library** (npm `scanic` 1.6.0, modified 2026-08-12; GitHub marquaye/scanic, MIT, 61★, pushed 2026-08-29) | `scanDocument(img, {mode:'detect'})` → `{success, corners}`; optional `detector:'ml'` → `{score}` 0–1 “P(document present)”; Node + browser WASM | **Actively maintained** (rapid 2025–2026 releases); regression baselines for classical + ML | **`success: false`** path; ML mode exposes **`score`**; classical tunables (`minArea`, Canny thresholds) | Classical: same as OpenCV. ML (DocCornerNet-derived, lazy ~2MB model): better on shadows/low contrast per README; still assumes **planar quad**. Curled thermal paper not addressed. | Strongest **Node-native** candidate with explicit success/fail + optional score; ~100KB + optional ML chunk vs 30MB OpenCV.js. |
| **quadscan** | **Library** (npm `quadscan` 1.0.0, 2026-05-24; GitHub storrealbac/quadscan, MIT, 0★) | `Quadscan.scan(image)` → `{success, corners, confidence, …}`; DocAligner ONNX via `onnxruntime-web` | New/small; browser-first; ~4.5MB model lazy load | **`success` + `confidence`** in README example | ML trained on **document** photos (DocAligner set), not receipt-specific; browser ORT WebGPU/WASM — **Node server path unclear** (needs canvas + ORT runtime) | Good reference for **confidence-shaped API**; overlap with scanic ML path. |
| **@andor83/ml-web-scanner** | **Library** (npm, MIT; GitHub andor83/ml-web-scanner, pushed 2026-07-03, 0★) | Browser worker + Vue component; **you supply** DocAligner `.onnx` `modelUrl` + `ortWasmPaths`; `heatmapThreshold`, smoothing | Niche; camera-stream oriented | Implicit via detection interval / steady quad; threshold on heatmaps | Same DocAligner limits; bundler/worker complexity | More integration glue than drop-in for headless API. |
| **docaligner-docsaid** (DocAligner) | **Library** (PyPI `docaligner-docsaid` 0.1.0, modified 2026-07-03; GitHub DocsaidLab/DocAligner, Apache-2.0, 107★, pushed 2026-01-13) | `DocAligner()(img)` → `numpy (4,2)` corners; docs mention **classification head** (BCE) for “document present” vs spurious corners | Maintained docs + web demo; ONNX export for deployment | **Document-presence classification** intended for deploy gating (README model design); corners always returned unless caller checks cls score | Heatmap regression + postprocess; general document photos; **not receipt-tuned**; Python subprocess cost for Node API | Best **Python detect-quad** installable; pairs with ONNX for Node if ported. |
| **DocCornerNet-CoordClass** | **Research repo** (GitHub mapo80/DocCornerNet-CoordClass, MIT, 4★, pushed 2026-03-11) | SimCC corner model; export ONNX/TFLite; used inside scanic ML | Research → production via scanic | IoU / corner error metrics in README; validation snippets in Context7 mirror | Lightweight; document benchmarks — receipt curl not covered | Approach source; scanic already embeds slim variant. |
| **@u4/opencv4nodejs** | **Bindings** (npm 7.1.2) | Full OpenCV API in Node; **no detect-quad helper** | Maintained fork; **Windows native build** (cmake, opencv-build) is operational risk | Caller implements fail-loud | Same as classical | Use only if willing to own full pipeline + native addon CI. |
| **imutils (Python)** | **Helper lib** | `four_point_transform`, `order_points` only | Stable, old (PyImageSearch/imutils) | N/A (warp step) | N/A | Compose with custom detection. |
| **docTR** | OCR library | Text **word** quads + optional **layout regions** (Title, Table, …) | Very active (mindee/doctr, pushed 2026-08-28) | Word/region confidences — **not page boundary** | Will not return 4 page corners for crop | **Out of lane** for background crop (confirms user LayoutLM-adjacent scope split). |
| **PaddleOCR layout / PaddleOCR-VL** | OCR + layout | `layout_shape_mode: quad` for **interior regions**, not whole page | Heavy Python stack | Region scores | Page often fills frame; layout boxes are text blocks | Poor fit for “crop paper from table”. |
| **U²-Net** | Salient-object segmentation | Mask, not 4 corners | Classic CVPR’20 code | Threshold mask area | Receipt vs table often low saliency contrast; mask ≠ quad | Needs mask→quad heuristics; not document-specific. |
| **DewarpNet** | Dewarping (ICCV’19) | Flow field / 3D shape; **no quad API** | Research code (pushed 2024-11); 625★ | N/A | Addresses **curl** better than homography but different problem | Downstream deskew, not table background crop. |
| **YOLO-world / generic YOLO doc detectors** | Generic detection | e.g. pagescan `yolo_doc_v1.onnx` (third-party bundle) | General document class | Box/mask conf | Not receipt-tuned; axis-aligned or mask→quad extra step | DRCCBI (2025) hybrid YOLOv8 mask + CV — research code github.com/HorizonParadox/DRCCBI |
| **Receipt / invoice one-off projects** | Projects | See below | Varies | Usually none | Same classical limits | Copy algorithm, not depend. |

### Classical pipeline — well-cited tutorials (not libraries)

| Source | URL | Packaged? | Receipt relevance |
|--------|-----|-----------|-------------------|
| PyImageSearch “4-point getPerspectiveTransform” (2014-08-25) | https://pyimagesearch.com/2014/08/25/4-point-opencv-getperspective-transform-example/ | Code → `imutils` | Defines `order_points` + homography contract |
| PyImageSearch mobile document scanner (2014-09-01) | https://pyimagesearch.com/2014/09/01/build-kick-ass-mobile-document-scanner-just-5-minutes/ | Tutorial + imutils | Same pipeline; adaptive threshold after warp |
| PyImageSearch OCR receipts (2021-10-27) | https://pyimagesearch.com/2021/10/27/automatically-ocring-receipts-and-scans/ | Tutorial | **Receipt-specific** classical contour→4pt→warp |
| PyImageSearch contour approximation (2021-10-06) | https://pyimagesearch.com/2021/10/06/opencv-contour-approximation/ | Tutorial | ε sweep for `approxPolyDP` failure debugging |
| OpenCV.js live scanner blog | https://opencv.org/smart-document-scanning-with-live-ocr-using-opencv-js/ | Tutorial | Canny→contours→homography; adaptive thresh for OCR |
| agentbus document scanner (2026) | https://agentbus.sh/posts/how-to-build-document-scanner-with-opencv-and-perspective-transform/ | Tutorial | Explicit receipt-on-table example; ε tuning 0.02–0.04 |
| OpenCV contours tutorial | https://docs.opencv.org/4.x/d4/d73/tutorial_py_contours_begin.html | Docs | `findContours` baseline |
| Stack Overflow approxPolyDP ≠ 4 | https://stackoverflow.com/questions/44254582/opencv-in-python-enforce-quadrilateral-detection | Q&A | Documents multi-vertex failure mode |

### Receipt-specific / invoice GitHub projects (sample)

| Repo | Last push (GH API) | Stars | Approach | Copyable? |
|------|-------------------|-------|----------|-----------|
| ahmaddioxide/Receipt_Scanner_DIP | 2023-05-26 | 1 | Classical OpenCV contour + perspective + adaptive thresh | Yes — `receipt_scanner.py` pattern |
| KMKnation/Four-Point-Invoice-Transform-with-OpenCV | 2017-12-19 | 38 | `convert_object` driver: multi-rect candidates, largest valid | Yes — invoice-oriented |
| ArashNasrEsfahani/Python-Document-Scanner-OpenCV | 2025-08-10 | 13 | Notebook: Canny→largest quad `approxPolyDP` | Yes — generic doc |
| imehranasgari/Auto-Document-Scanner-OpenCV | 2025-11-04 | 2 | Morph+Canny+dilation→top-5 contours→first 4-gon | Yes |
| joellijo32/Document-Scanner-using-OpenCV | 2025-12-09 | 0 | CLI scanner; receipt.jpg in assets | Yes |
| Niko receipt undistort blog | https://nikonyrh.github.io/receiptundistort.html | Blog | **OCR-guided** mesh warp for **crumpled** receipts — not simple quad | Advanced alternative when homography insufficient |
| way2vat non-rectangular rectangle | https://way2vat.com/the-weird-case-of-the-non-rectangular-rectangle/ | Blog | Industry note: thermal curl breaks rectangle assumption | Informs failure expectations |

### Known failure modes (thermal receipt on table) — cross-cutting

| Condition | Mechanism | Classical symptom | DL (DocAligner-class) symptom |
|-----------|-----------|-------------------|-------------------------------|
| Dark wood table, shadow | Low edge contrast | No closed contour or table edge wins | May still regress corners with cls score drop |
| Beige paper on beige surface | Low chroma contrast | Canny misses boundary | ML marketed as strength (quadscan README) |
| Clutter (utensils, phone) | Largest-contour heuristic | Wrong quad | May lock onto document-like bbox |
| Thermal fade / glossy glare | Broken edges | Fragmented contour | jscanify v1.3+ claims glare suppression |
| Curled / rolled thermal paper | Non-planar surface | “Quad” exists but warp distorts text | Same — quad is approximation; DewarpNet-class needed for curl |
| Narrow tall receipt | Extreme aspect | `approxPolyDP` unstable | Usually OK if cls fires |
| Rounded ticket corners | No sharp vertices | 4-gon approx fails | Corner heatmaps on rounded corners |

### Output contract (homography-ready)

Parent should require callers to receive:

1. Four `(x,y)` floats in consistent order (TL, TR, BR, BL) in **original image space** (scale contour coords if pipeline resizes for detection).
2. Explicit **`ok: false`** (or throw) when: no contour; not convex; area < threshold; duplicate/degenerate points; aspect ratio out of bounds; optional ML cls/score below threshold.
3. Optional **`confidence`** / **`score`** when using ML libraries (scanic ML `score`, quadscan `confidence`, DocAligner classification head).
4. Do **not** silently fall back to uncropped image (aligns with root-cause-over-workarounds).

## Recommended-for-parent-evaluation notes (no stack selection)

- **Installable detect-quad APIs exist on two axes**: (A) classical via **jscanify** / **scanic** (Node-capable) wrapping contour logic; (B) ML via **DocAligner** ecosystem (**docaligner-docsaid** Python, **scanic** `detector:'ml'`, **quadscan** browser ONNX). No mature npm package exposes raw `approxPolyDP` alone — that remains ~30 lines of custom OpenCV or WASM.
- **Node API fit**: **scanic** minimizes OpenCV.js weight and documents Node; **jscanify** needs OpenCV loaded; **@u4/opencv4nodejs** is powerful but native-addon heavy on Windows; **Python DocAligner** implies subprocess unless ONNX ported to `onnxruntime-node`.
- **Receipt vs document**: Public receipt repos are almost all **classical one-offs** (2023 or earlier); no maintained receipt-only quad model found. DocAligner/scanic/quadscan target **documents**, not thermal receipts — transfer risk on curl/low contrast remains.
- **docTR / Paddle layout / U²-Net / DewarpNet / YOLO-world** do not satisfy “4 page corners for crop” without a different architecture; docTR quads are **text**, DewarpNet solves **non-planar curl** after crop.
- **Fail-loud**: Only **scanic** (`success`, ML `score`), **quadscan** (`success`, `confidence`), **jscanify** (`null` extract), and **DocAligner cls head** document gating; classical tutorials leave confidence as **exercise** — parent must spec thresholds.
- **Curled receipt**: Single homography from any quad detector is **fundamentally limited** (thelinuxcode.com perspective pitfalls; way2vat; nikonyrh mesh approach). Quad crop still helps table background removal even if deskew/dewarp is a later step.

## Provenance

| Claim | Source (retrieved 2026-08-31) |
|-------|-------------------------------|
| jscanify API, null extract, contour algorithm | https://github.com/puffinsoft/jscanify/wiki/API ; https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify.js |
| jscanify npm 1.4.3 / GH push 2026-07-20 | npm registry; `gh api repos/puffinsoft/jscanify` |
| scanic detect API, ML score, Node | https://github.com/marquaye/scanic/blob/main/README.md |
| scanic npm 1.6.0 / push 2026-08-29 | npm registry; `gh api repos/marquaye/scanic` |
| quadscan success/confidence | https://raw.githubusercontent.com/storrealbac/quadscan/main/README.md |
| DocAligner corners + cls head | https://raw.githubusercontent.com/DocsaidLab/DocAligner/main/README.md ; https://pypi.org/project/docaligner-docsaid/ |
| Classical receipt OCR pipeline | https://pyimagesearch.com/2021/10/27/automatically-ocring-receipts-and-scans/ |
| approxPolyDP multi-vertex issue | https://stackoverflow.com/questions/44254582/opencv-in-python-enforce-quadrilateral-detection |
| docTR layout ≠ page boundary | https://mindee.github.io/doctr/latest/using_doctr/using_models.html |
| DewarpNet no quad | https://github.com/cvlab-stonybrook/dewarpnet ; ICCV’19 paper PDF |
| U²-Net salient object | https://github.com/xuebinqin/U-2-Net |
| Paddle layout_shape_mode quad | https://paddlepaddle.github.io/PaddleX/3.4/en/pipeline_usage/tutorials/ocr_pipelines/PaddleOCR-VL.html |
| Internal prep baseline | `apps/api/src/features/receipts/pipeline/prepReceiptImage.ts` |
| Parent scope | `.cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md` |

## Gaps

- No headless benchmark on **actual budget-tools receipt fixtures** (thermal, dark table) across scanic classical vs ML vs jscanify.
- **quadscan** / **ml-web-scanner** Node server viability not verified (canvas, ORT node, cold-start ms).
- **@u4/opencv4nodejs** Windows install friction in this repo not tested.
- DocAligner **classification threshold** for fail-loud not documented as a single public constant.
- Receipt-specific DL datasets (SROIE, WILDRECEIPT in docTR) are **text OCR**, not page quad labels.
- Commercial SDKs (Scanbot, Dynamsoft) excluded per parent scope — may have superior edge cases.

## Stop

Cycle 1 wider lane saturated for **public OSS quad-crop detectors**: recurring names (jscanify, scanic, DocAligner, classical PyImageSearch lineage) with no new receipt-tuned quad library discovered. Further cycles likely redundant unless parent adds fixture-driven benchmarks or expands to commercial SDKs / `onnxruntime-node` spike.

## Evidence relationships

```text
Parent question: "crop paper from table before vision"
    │
    ├─► Classical contour quad (tutorials) ──► imutils warp helper (Python only)
    │         │
    │         ├─► jscanify (Node+browser, OpenCV dep, null on fail)
    │         └─► scanic classical WASM (success flag)
    │
    ├─► ML corner heatmaps (DocAligner) ──► docaligner-docsaid (Python API)
    │         │
    │         ├─► scanic detector:'ml' (score)
    │         ├─► quadscan (confidence, browser ORT)
    │         └─► ml-web-scanner (camera UI glue)
    │
    ├─► Wrong tool for page crop ──► docTR word/layout quads
    │                              └─► Paddle layout regions
    │                              └─► U²-Net masks
    │
    └─► Post-crop / beyond quad ──► DewarpNet (curl)
                                  └─► nikonyrh OCR mesh (crumple)

Fail-loud contract: parent must unify scanic.success | quadscan.confidence |
DocAligner cls | jscanify null | custom classical validators
```
