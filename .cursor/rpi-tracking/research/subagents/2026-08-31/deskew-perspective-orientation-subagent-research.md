<!-- markdownlint-disable-file -->

# Lane Research: deskew, perspective, orientation

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Wider |
| Lane | Deskew, rotate-to-vertical, four-point perspective correction |
| Posture | expansive |
| Status | Complete (cycle 1) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/deskew-perspective-orientation-subagent-research.md |
| Parent artifact | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (read-only) |

## Lane inputs

- Parent brief: Node API receipt-image prep needs crop, deskew/rotate-to-vertical/perspective-correct before vision OCR; sharp already used; tesseract.js removed from extract.
- Lane questions: four-point perspective libs; deskew without quad (projection/Hough/minAreaRect/leptonica/ImageMagick/unpaper); EXIF vs content OSD including 180°; homography edge cases; npm deskew packages.
- Internal anchor: `prepReceiptImage.ts` calls `sharp(bytes).rotate()` (EXIF auto-orient) then normalise/resize — deskew explicitly not applied.

## Actions

- Fetched OpenCV 4.x imgproc transform docs (`getPerspectiveTransform`, `warpPerspective`).
- Fetched scikit-image `ProjectiveTransform` API docs.
- Checked imutils GitHub/PyPI maintenance signals (last release, last commit, open issues).
- Checked sbrunner/deskew PyPI 1.6.1 and README/source for algorithm (Hough line peaks via scikit-image).
- Fetched Leptonica skew.c and flipdetect.c documentation (differential projection profile deskew; `pixUpDownDetect` for 180°).
- Fetched Tesseract tessdoc (OSD PSM 0, deskew note, orientation API example) and GitHub OSD issues (#4172, #4409, #2913).
- Fetched unpaper README, image-processing.md, Debian manpage (deskew CLI flags).
- Fetched ImageMagick `-deskew` option docs.
- Fetched sharp rotate/autoOrient docs; confirmed no perspective/homography API.
- Queried npm registry: `deskew` (unpublished), `image-deskew` (404), `ppu-ocv`, `cerne-scanner`, `page-dewarp-js`, `docorient` (PyPI only).
- Reviewed neural OSD: docorient PyPI/GitHub, PaddleOCR PP-LCNet_x1_0_doc_ori docs.
- Reviewed homography/aspect-ratio literature (PyImageSearch four-point post, SPIE homography without known AR, thermal receipt width references).

## Findings by subproblem

### Perspective (four-point homography)

- OpenCV `cv2.getPerspectiveTransform(src, dst)` computes 3×3 homography from four point pairs; `cv2.warpPerspective` applies it — mature C++/Python library primitives. https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html
- scikit-image `ProjectiveTransform` is a maintained Python library class for homographies; estimate via `from_estimate`, apply via `skimage.transform.warp`. https://scikit-image.org/docs/stable/api/skimage.transform.html#skimage.transform.ProjectiveTransform
- imutils `four_point_transform` is a ~70-line Python snippet wrapping OpenCV: orders TL/TR/BR/BL, sets output size to max edge lengths, calls `getPerspectiveTransform` + `warpPerspective`. https://github.com/PyImageSearch/imutils/blob/master/imutils/perspective.py
- imutils maintenance: PyPI latest **0.5.4 uploaded 2021-01-15**; GitHub last commit **2022-01-27**; open issues include "Is the project still maintained?" (#280, Feb 2023) and `four_point_transform` corner-order bugs (#221). Treat as **unmaintained convenience wrapper**, not a dependency to trust for edge-case quad ordering.
- Standard output-size heuristic (max of opposite edge lengths) **does not preserve physical aspect ratio** when the true document aspect is unknown; PyImageSearch notes improving results by accounting for input ROI aspect ratio. https://pyimagesearch.com/2014/08/25/4-point-opencv-getperspective-transform-example/
- Academic note: homography for document scanning can be estimated without known aspect ratio or calibrated camera (Juarez-Salazar & Diaz-Ramirez, 2018). https://doi.org/10.1117/12.2322001
- Node/sharp gap: sharp offers `rotate` (EXIF) and `affine` (2×2 matrix only) — **no `warpPerspective`/homography**. https://sharp.pixelplumbing.com/api-operation/#rotate

### Deskew without quad (already cropped scan)

| Approach | Kind | Maturity / notes |
|----------|------|------------------|
| Differential projection profile (maximize adjacent row-sum differences) | Algorithm in **Leptonica** C library (`pixFindSkew`, `skew.c`) | Mature; used internally by Tesseract/Leptonica preprocessing; coarse sweep + binary search; explicitly prefers this over Hough for speed. http://www.leptonica.org/skew-measurement.html , https://tpgit.github.io/Leptonica/skew_8c.html |
| Hough line peaks → modal angle | **sbrunner/deskew** PyPI library (v1.6.1, Jun 2026); Canny + `hough_line_peaks` | Actively maintained MIT Python lib; default angle range ±45° (optional `angle_pm_90` for ±90°); rotation left to caller (OpenCV/skimage). https://pypi.org/project/deskew/ , https://github.com/sbrunner/deskew |
| Hough (OpenCV variant) | **fast-deskew-cv** PyPI drop-in using OpenCV instead of skimage Hough | Documents same pipeline as sbrunner/deskew. https://pypi.org/project/fast-deskew-cv/ |
| minAreaRect / baseline / Hough ensemble | Snippet pattern in **ppu-ocv** `DeskewService` (npm) | npm `ppu-ocv@4.0.0` published ~Jul 2026; OpenCV.js-based; deskew split from paddle OCR v5. https://www.npmjs.com/package/ppu-ocv |
| Projection profile (variance) | Classic literature / Leptonica paper | Leptonica docskew.pdf discusses Hough vs projection-profile approaches. http://www.leptonica.org/papers/docskew.pdf |
| ImageMagick `-deskew threshold%` | **CLI** (also callable via shell) | Built-in; "threshold of 40% works for most images"; optional auto-crop via `option:deskew:auto-crop`. https://imagemagick.org/command-line-options/#deskew |
| unpaper deskew | **CLI** | Rotates masks by scanning dark pixels along virtual lines at varying angles; default scan range ±5°; `--pre-rotate`/`--post-rotate` only ±90 (not 180). Latest release **unpaper-7.0.0 (2022-04-20)**. https://github.com/unpaper/unpaper , https://github.com/unpaper/unpaper/blob/main/doc/image-processing.md |
| Tesseract internal deskew | Library side-effect | OSD example returns `deskew_angle` from `PageIterator::Orientation` alongside 90°-increment orientation — separate from small-angle deskew. https://tesseract-ocr.github.io/tessdoc/APIExample.html |

Deskew vs perspective distinction (evidence): unpaper deskew is **small-angle rotation** on detected rectangular masks; four-point warp addresses **trapezoidal perspective** from camera angle. Different failure modes.

### Orientation (rotate-to-vertical / 90° increments / 180°)

**EXIF (metadata)**

- sharp `.rotate()` with no angle calls auto-orient from EXIF `Orientation` tag, then strips tag. Already used in `prepReceiptImage`. https://sharp.pixelplumbing.com/api-operation/#rotate
- EXIF handles 90/180/270 when camera wrote orientation metadata; **does not help** when pixels are upright in file but content is logically upside-down, or when EXIF missing/wrong.

**Content-based OSD (90° family)**

- Tesseract OSD: `--psm 0` (orientation and script detection only); reports `Orientation in degrees` (0/90/180/270) and `Rotate` correction. https://tesseract-ocr.github.io/tessdoc/APIExample.html
- Tesseract also documents rotation/deskew as image-quality preprocessing before OCR. https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
- OSD reliability issues on real scans: wrong 180° with low confidence (#4172); fix often `-c min_characters_to_try=200` and/or `-l eng`; short/low-text pages error "Too few characters" (#4409).
- Maintainer-endorsed fallback when OSD fails: run full OCR at 0/90/180/270 and pick best confidence (#2913) — "classic way" but expensive.

**180° upside-down specifically**

- Tesseract OSD *can* emit 180° but is unreliable on receipts with little text or digit-heavy content (issues above).
- Leptonica `pixUpDownDetect`: compares ascender/descender hit-miss counts on **1 bpp deskewed English text, 150–300 ppi**; positive conf = rightside-up. Requires binarization; `pixUpDownDetectGeneral` with `npixels>0` recommended for digit-heavy pages. https://tpgit.github.io/Leptonica/flipdetect_8c.html , https://github.com/DanBloomberg/leptonica/blob/master/src/flipdetect.c
- Neural alternatives (Python, not npm): **docorient** — energy axis detector + MobileNetV2 ONNX flip classifier for 0/90/180/270; claims 98% combined accuracy; ~8.5 MB embedded model. https://pypi.org/project/docorient/ , https://github.com/lucasleirbag/DocOrient
- **PaddleOCR PP-LCNet_x1_0_doc_ori**: 4-class (0/90/180/270), 99.06% acc, 7 MB; part of Paddle doc preprocessing pipeline. https://www.paddleocr.ai/v3.5.0/en/version3.x/module_usage/doc_img_orientation_classification.html

**Receipt-specific note:** thermal receipt captures may lack EXIF; content OSD is the relevant path for 90°/180° when EXIF absent.

### Homography edge cases

- **Trapezoid / keystone:** Expected input to four-point warp; rectangle in scene becomes quadrilateral. Corner order matters (TL/TR/BR/BL); wrong order yields mangled output (documented in tutorial literature).
- **Partial occlusion / incomplete quad:** No library auto-magic cited; contour approximation + aspect validation (e.g. reject if AR outside band) is a common pattern in document-scanner examples; VisionMetrix uses AR 1.0–1.8 for A4-like sheets — **not transferable to receipts**. https://github.com/Khushishah224/VisionMetrix
- **Aspect ratio of typical receipt:** Thermal paper has standard **widths** (57 mm mobile, 80 mm desktop) but **height is content-dependent** (roll length varies; photographed receipt height depends on item count). No fixed physical aspect ratio like A4 (297/210 ≈ 1.414). Industry refs emphasize width + roll OD, not image AR. https://www.jotamachinery.com/pos-thermal-paper-roll-size-chart/
- Implication: four-point warp output dimensions from edge-length heuristic produce a **rectified view** but not necessarily true-scale proportions unless aspect is assumed (e.g. known paper width) or estimated (homography methods without known AR).
- **Curved receipts / page curl:** `page-dewarp-js` (npm) targets cubic-sheet dewarping, not flat homography; different problem. https://www.npmjs.com/package/page-dewarp-js

## Library vs CLI vs snippet

| Name | Type | Deskew | Perspective | OSD (90/180/270) | License | Maintenance (2026-08-31) |
|------|------|--------|-------------|------------------|---------|--------------------------|
| OpenCV (`getPerspectiveTransform`, `warpPerspective`, Hough) | Library (C++/Python; JS via opencv.js bindings) | via Hough snippet | yes | no | Apache 2.0 | Active |
| scikit-image (`ProjectiveTransform`, `hough_line`) | Library (Python) | via deskew lib | yes | no | BSD | Active |
| imutils `four_point_transform` | Snippet/wrapper (Python) | no | yes (wraps OpenCV) | no | MIT | **Stale** (PyPI 2021; commit 2022) |
| Leptonica | Library (C) | yes (`skew.c`) | no | yes (`flipdetect.c`) | BSD | Stable/mature |
| sbrunner/deskew | Library (Python) | yes (angle only) | no | no | MIT | **Active** (v1.6.1 Jun 2026) |
| ImageMagick `-deskew` | CLI | yes | no | no | Apache 2.0 | Active |
| unpaper | CLI | yes (small angle) | no (mask crop/rotate) | partial (`--pre/post-rotate` ±90 only) | GPL-2.0 | Low churn (last release Apr 2022) |
| Tesseract OSD `--psm 0` | CLI/library | reports deskew_angle | no | yes (0/90/180/270) | Apache 2.0 | Active |
| docorient | Library (Python) | no | no | yes (neural) | (see PyPI) | Recent PyPI 0.4.x |
| PaddleOCR doc_ori | Model/module | no | no | yes (neural) | Apache 2.0 | Active in Paddle 3.x |
| sharp | Library (Node) | no | no (affine only) | EXIF only | Apache 2.0 | Active |
| ppu-ocv `DeskewService` | Library (npm) | yes | yes (separate modules) | no | MIT | Recent (v4.0.0 ~Jul 2026) |
| cerne-scanner | Library+CLI (npm) | yes (keywords) | yes | no | MIT | Recent (v0.4.0 ~Jul 2026) |
| npm `deskew` | — | — | — | — | — | **Unpublished 2020-10-04** |
| npm `image-deskew` | — | — | — | — | — | **Not found** |

## Provenance

| Source | URL | Used for |
|--------|-----|----------|
| OpenCV imgproc transform | https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html | perspective API |
| scikit-image ProjectiveTransform | https://scikit-image.org/docs/stable/api/skimage.transform.html#skimage.transform.ProjectiveTransform | homography class |
| imutils perspective.py | https://github.com/PyImageSearch/imutils/blob/master/imutils/perspective.py | four_point_transform snippet |
| imutils PyPI 0.5.4 | https://pypi.org/project/imutils/0.5.4/ | release date 2021-01-15 |
| imutils GitHub commits API | https://api.github.com/repos/PyImageSearch/imutils/commits?per_page=1 | last commit 2022-01-27 |
| sbrunner/deskew | https://github.com/sbrunner/deskew , https://pypi.org/project/deskew/ | Hough deskew lib |
| Leptonica skew | http://www.leptonica.org/skew-measurement.html , https://tpgit.github.io/Leptonica/skew_8c.html | projection deskew |
| Leptonica flipdetect | https://tpgit.github.io/Leptonica/flipdetect_8c.html | 180° detection |
| Tesseract tessdoc | https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html , APIExample | OSD, deskew guidance |
| Tesseract issues | https://github.com/tesseract-ocr/tesseract/issues/4172 , #4409 , #2913 | OSD 180° reliability |
| unpaper | https://github.com/unpaper/unpaper , doc/image-processing.md | CLI deskew |
| ImageMagick | https://imagemagick.org/command-line-options/#deskew | CLI deskew |
| sharp | https://sharp.pixelplumbing.com/api-operation/#rotate | EXIF rotate |
| docorient | https://pypi.org/project/docorient/ , https://github.com/lucasleirbag/DocOrient | neural OSD |
| PaddleOCR doc orientation | https://www.paddleocr.ai/v3.5.0/en/version3.x/module_usage/doc_img_orientation_classification.html | neural OSD |
| npm registry queries | https://www.npmjs.com/package/ppu-ocv , cerne-scanner, page-dewarp-js | Node deskew/perspective pkgs |
| PyImageSearch aspect note | https://pyimagesearch.com/2014/08/25/4-point-opencv-getperspective-transform-example/ | AR in perspective |
| Homography w/o known AR | https://doi.org/10.1117/12.2322001 | aspect unknown |
| Thermal receipt sizes | https://www.jotamachinery.com/pos-thermal-paper-roll-size-chart/ | width vs height |
| Internal prepReceiptImage | apps/api/src/features/receipts/pipeline/prepReceiptImage.ts | current EXIF-only rotate |

## Gaps

- No hands-on benchmark of deskew/Hough vs Leptonica projection on **budget-tools receipt fixtures** (lane is literature/registry only).
- cerne-scanner and ppu-ocv claim deskew/perspective but source-level algorithm detail not fully traced in this cycle.
- unpaper maintenance after 2022 not deeply verified (commits vs release cadence).
- Node-native homography: which opencv binding (`@opencvjs/node`, `opencv4nodejs`, WASM) fits Windows API deploy — out of lane but blocks Node-only perspective without subprocess.
- Whether OpenRouter vision is robust to 180° without explicit correction — product lane, not CV library lane.
- GPL-2.0 unpaper license may conflict with parent personal-app OSS preference (flag for parent).

## Stop

Cycle 1 wider lane saturated for named libraries/algorithms. Remaining fetches would likely duplicate OpenCV tutorial content or npm wrapper marketing without new classification (library vs CLI vs snippet, maintenance, receipt-specific constraints). Next wave would need fixture-driven accuracy comparison or Node binding deploy-cost lane.

## Evidence relationships

- **Parent prepReceiptImage** → covers EXIF orientation only; does not address small-angle deskew or perspective — gap aligns with lane scope.
- **Perspective stack** → OpenCV/skimage are canonical libraries; imutils is optional snippet layer with stale maintenance.
- **Deskew stack** → three families: (1) projection profile / Leptonica, (2) Hough/modal angle / sbrunner deskew, (3) CLI ImageMagick/unpaper; receipt photos may need Hough or projection after crop.
- **Orientation stack** → layered: EXIF (sharp, done) → 90°/270° (OSD or neural) → 180° ambiguity (OSD unreliable; Leptonica needs binarize; neural docorient/Paddle; brute-force OCR fallback).
- **Homography sizing** → four-point warp libraries do not infer receipt AR; thermal width standards help only if width known in mm/pixels.
- **Node npm deskew** → no maintained package literally named `deskew`; closest are ppu-ocv, cerne-scanner (broader scanner), or subprocess to Python/ImageMagick.
