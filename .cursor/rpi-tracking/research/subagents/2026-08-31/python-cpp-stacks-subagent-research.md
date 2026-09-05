<!-- markdownlint-disable-file -->

# Lane Research: Python/C++ document-receipt scan stacks and Node invocation

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Wider |
| Lane | Python and C++ document/receipt scan stacks; Node-to-Python cost |
| Posture | expansive |
| Parent artifact | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/python-cpp-stacks-subagent-research.md |

## Lane inputs

- Host: Node TypeScript API on Windows; sharp already present; caller wants one function the API can call.
- Python sidecar is an alternative to evaluate, not assumed default.
- Questions: de facto Python/C++ libs for quad/warp/deskew/binarize; per-lib license/release/wheels/wrapper pattern; Node→Python patterns and Windows deploy cost; flag GPU/DL vs classical CV.
- Explicit limits: none.
- Retrieval date: 2026-08-31.

## Actions

- Fetched PyPI metadata: opencv-python, scikit-image, imutils, python-doctr, paddleocr, pillow, pytesseract, albumentations, albumentationsx, kornia.
- Fetched official docs: OpenCV pip install, scikit-image transform API, docTR models/IO, PaddleOCR detection and infer utility, Tesseract ImproveQuality (Leptonica preprocessing), Pyodide usage/roadmap, Leptonica license.
- Reviewed canonical document-scanner tutorials (PyImageSearch, LearnOpenCV) and PaddleOCR get_rotate_crop_image source.
- Cross-read parent brief and apps/api/src/features/receipts/pipeline/prepReceiptImage.ts for host constraints (deskew not applied; JPEG out for vision).

## Findings table

| Library | Kind | License | Last release (PyPI / upstream) | Windows install | CV class | Receipt-on-table fit | Typical one-function wrapper |
|---------|------|---------|-------------------------------|-----------------|----------|----------------------|------------------------------|
| **OpenCV** (opencv-python / opencv-python-headless) | Library (C++ core, Python bindings) | Apache 2.0 (OpenCV); MIT (opencv-python packaging scripts) | opencv-python 4.14.0.94 (2026-07-28) and 5.0.0.93 (2026-07-02) on PyPI; pick one package only | Pre-built win_amd64 wheels via pip; headless variant avoids Qt/GUI deps — preferred for API servers | **Classical** (optional DNN module for DL, not required for scan pipeline) | **De facto** stack for page quad: grayscale → blur → Canny → findContours → approxPolyDP(4) → getPerspectiveTransform → warpPerspective; CLAHE/adaptiveThreshold/Otsu for binarize; minAreaRect + warpAffine for deskew. Weak when receipt has no strong paper boundary vs table (contour heuristic fails). | `def prep_receipt(buf: bytes) -> bytes:` decode with cv2.imdecode; run pipeline; cv2.imencode('.jpg', out); expose as CLI reading stdin/writing stdout for Node child_process |
| **scikit-image** | Library (Python + compiled extensions) | BSD-3-Clause / BSD-2-Clause / MIT (per-file) | 0.26.0 (2025-12-20) | win_amd64 wheels on PyPI (Python >=3.11) | **Classical** | Complements OpenCV: `ProjectiveTransform` + `warp` for homography; `hough_line` / `probabilistic_hough_line` for skew angle; `filters` / `restoration` for denoise; `exposure` for contrast. No built-in “find receipt quad” — still need contour logic (often OpenCV) or external quad. | Same composed function; skimage used for deskew estimate + warp while OpenCV does edge/contour |
| **imutils** | Thin helper library over OpenCV | MIT | 0.5.4 (last PyPI upload ~2019; repo active but releases stale) | pip installs pure Python sdist; depends on opencv-python + numpy (wheels cover heavy lifting) | **Classical** | `imutils.perspective.four_point_transform(image, pts)` is the standard warp helper in tutorials; `grab_contours` for OpenCV 3/4 compat; sorting contours by area. Not a full pipeline — one step only. | `four_point_transform(orig, screenCnt.reshape(4,2))` inside larger `prep_receipt` after contour detection |
| **Pillow** | Library (imaging I/O and basic ops) | MIT-CMU (HPND-style) | 12.3.0 on PyPI (2026; exact upload in version history) | win_amd64 wheels | **Classical** (limited) | EXIF transpose, resize, crop box, rotate, point transforms, ImageEnhance (contrast/brightness/sharpness). **No** contour/quad detection, perspective warp, or adaptive threshold. Useful for decode/encode and simple enhancement only. | Usually paired with OpenCV/numpy arrays; not sufficient alone for crop+deskew+binarize |
| **docTR** (python-doctr) | DL OCR framework (PyTorch) | Apache 2.0 | 1.1.0 on PyPI badge; 1.0.1 uploaded 2026-02-04; releases are sdist | `pip install python-doctr`; pulls PyTorch (large); CPU/GPU; Windows supported but heavy | **Deep learning** (det + rec + optional layout) | End-to-end OCR, not a geometry-first scan library. `detection_predictor` returns **word/line boxes** (relative geometry 0–1), not page quad. `ocr_predictor(..., straighten_pages=True)` straightens pages before det — page-level orientation, not table-background crop. Boxes can be scaled to pixels and cropped in user code; no first-class full-page perspective warp API like imutils. | `def doctr_boxes(buf):` run `detection_predictor` only; multiply geometry by dimensions; optional crop regions — **overkill** if goal is prep without OCR |
| **PaddleOCR** | DL OCR toolkit (PaddlePaddle / PaddleX) | Apache 2.0 | 3.7.0 (release notes 2026-06-11) | pip package; Windows supported (docs cite PP-OCR C++ local deploy on Windows); pulls paddlex stack — large install | **Deep learning** (PP-OCRv4/v5/v6 det + cls + rec) | Text **det** outputs quadrilateral boxes per text region. `get_rotate_crop_image` in tools/infer/utility.py uses cv2.getPerspectiveTransform + warpPerspective per box for recognition — **per-line crop**, not isolating receipt paper from table. PP-OCRv4_server_det / mobile_det documented in PaddleOCR 3.x module docs. Using det boxes to infer a single page boundary requires custom fusion (e.g., convex hull of all boxes) — not shipped as one call. | `PaddleOCR` pipeline class or det-only module; wrapper would still need classical or custom logic for page-level crop |
| **albumentations** | Augmentation library | MIT (legacy 2.0.8, **archived** July 2025) | 2.0.8 (2025-05-27) | wheels | **Classical transforms** (training augmentation) | Not a document scanner. Affine/perspective in Compose pipelines are for **data augmentation**, not robust production receipt prep. Morphological ops exist but no quad finder. | N/A for production prep |
| **albumentationsx** | Successor augmentation library | **AGPL-3.0-only** (commercial license separate) | 2.4.3 on PyPI (2026) | wheels | Same as above | Same; license may conflict with personal app if AGPL obligations apply | N/A |
| **Kornia** | Differentiable CV on PyTorch | Apache 2.0 | 0.8.3 on PyPI | wheels; requires torch | **Hybrid** — classical ops on GPU tensors | `kornia.geometry.transform.get_perspective_transform` + `warp_perspective` mirror OpenCV; CLAHE, filters, edge ops. Pulls full PyTorch runtime; best when already in DL training/inference path, not minimal Windows sidecar for classical prep | Torch tensor in/out wrapper inside PyTorch service |
| **Leptonica** | C image processing library | BSD-2-Clause | 1.84.1 (2024 upstream) | No standalone pip; bundled with Tesseract / tesserocr Windows wheels | **Classical** | Used **internally by Tesseract** for Otsu/Sauvola binarization, scaling, alpha removal, skew estimates (see tessdoc ImproveQuality). Not a document quad detector. Access from Python via Tesseract pipeline or tesserocr layout API (`AnalyseLayout` deskew angle). | Indirect: preprocess with OpenCV, OCR with Tesseract; or tesserocr for orientation/deskew metadata only |
| **pytesseract** | Python wrapper for Tesseract binary | Apache 2.0 | 0.3.13 (2024-08-16) | pip sdist; requires separate Tesseract Windows installer (UB Mannheim) | Wrapper (OCR) | Documents OpenCV preprocessing before pytesseract calls; not a CV library itself | `image_to_string(thresh)` after external prep function |
| **tesserocr** | Cython bindings to Tesseract+Leptonica | Apache 2.0 | 2.11.0 | Windows: prebuilt wheels with embedded libs (simonflueckiger builds) or conda | Wrapper + Leptonica access | Orientation/deskew via `AnalyseLayout()`; still needs external binarize/crop for quality | Layout analysis helper inside prep pipeline |

### Classical document-scan pipeline (de facto recipe)

Published tutorials converge on the same OpenCV composition (PyImageSearch 2014, LearnOpenCV, receipt OCR guides):

1. Resize for speed (fixed height).
2. Grayscale → GaussianBlur → Canny (often auto thresholds).
3. findContours → sort by area → approxPolyDP until 4 vertices.
4. Order corners → getPerspectiveTransform → warpPerspective.
5. Optional: adaptiveThreshold / Otsu / CLAHE; deskew via minAreaRect on foreground pixels or Hough lines.

imutils `four_point_transform` is the usual warp step. scikit-image can substitute for rotation estimation and `warp`. **None of these libraries alone delivers a maintained “scanReceipt()”** — the pipeline is composed manually.

### DL stacks vs classical for receipts on a table

| Approach | Strength | Weakness for this host |
|----------|----------|------------------------|
| Classical OpenCV quad | Fast CPU, small deps, predictable, no model download | Fails when edges are weak (receipt blends with table, shadows, crumples); largest-4-gon heuristic is fragile |
| docTR / Paddle det boxes | Strong text localization on cluttered photos | Boxes are text regions, not paper boundary; full DL stack + weights; cold start seconds; GPU optional but CPU heavy |
| docTR straighten_pages | Page orientation correction | Does not remove table background or perspective from phone angle alone |
| Paddle get_rotate_crop_image | Good per-text perspective rectification | Designed for recognizer input, not whole-receipt crop |

**Classical preferred** for a personal local API unless evaluation shows table shots need DL page segmentation (not evidenced as a one-call OSS solution here).

### C++ access from Node (without Python)

| Option | Notes |
|--------|-------|
| **@u4/opencv4nodejs** | OpenCV in-process; Apache/MIT ecosystem; last npm 7.1.2 (2024-09). Windows requires VS build tools, OpenCV install or auto-build; path-without-spaces constraint. Avoids Python subprocess but **high install fragility** on Windows vs pip opencv-python. |
| **opencv4nodejs** (original) | Unmaintained since 2022 — use fork above. |
| **sharp** (already in host) | libvips: rotate, resize, normalize, extract — **no** perspective/quad/binarize. Complements but does not replace scan stack. |
| **opencv.js / WASM** | Browser-oriented; large bundle; slower than native OpenCV. |
| **Pyodide** | Official docs: Node 18+ experimental; roadmap cites **3–5× slower than native Python**; multi-MB runtime; not for server-side CV throughput. **Not suitable** for this Windows API server lane. |

## Node-to-Python invocation patterns with costs

| Pattern | Mechanism | Latency / throughput | Windows personal API deploy cost | Fit for one `prepReceipt` call |
|---------|-----------|----------------------|----------------------------------|--------------------------------|
| **child_process.spawn** | `python prep_receipt.py` with file path or stdin/stdout bytes | **Process spawn ~50–300 ms** per call if not pooled; acceptable for rare extracts, poor for burst | Install Python 3.11+, `venv`, `pip install opencv-python-headless numpy`; pin versions in repo script; set `PYTHONPATH` or venv in spawn env | **Simplest** — single script, one entrypoint `main()` reading image path or base64 on argv/stdin |
| **python-shell** (npm) | Wrapper over spawn with JSON/text/binary modes | Same spawn cost; cleaner stdio parsing | Same Python venv; adds npm dep | Good for JSON `{imageB64}` → `{imageB64}` contract |
| **Persistent HTTP sidecar** | FastAPI + uvicorn on `127.0.0.1:PORT`; POST `/prep` multipart or base64 | **Amortizes spawn**; ~10–100 ms HTTP overhead; model load once if DL | Run sidecar manually or start from Node on API boot; optional PyInstaller exe for desktop-style bundling (Tauri patterns exist); firewall localhost only | Best when prep called frequently; optional for rare receipt uploads |
| **gRPC sidecar** | Typed protobuf service | Lower overhead than REST for streaming; more setup | Proto codegen, two processes | Overkill unless already polyglot microservice |
| **Named pipe / socket** | Custom binary protocol | Similar to HTTP sidecar | Custom | Rarely justified |
| **Pyodide in Node** | `import { loadPyodide }` | Large cold start; 3–5× native slowdown; memory pressure | npm pyodide package | **Reject** for server prep |
| **Conda env + subprocess** | Same as spawn with conda activate | Heavier disk footprint | Useful if mixing paddle/torch; not needed for opencv-only | Only if DL stack chosen |

### Deployment notes (Windows, personal local API)

- **Minimal classical sidecar**: Python 3.11 venv, `opencv-python-headless`, `numpy` (~50–80 MB wheels). No compiler if using wheels only.
- **scikit-image add-on**: another ~30–50 MB installed; may pull scipy.
- **docTR / PaddleOCR**: hundreds of MB to GB (torch or paddle + models); first inference downloads weights; CPU usable but seconds cold start; GPU drivers optional.
- **Operational coupling**: Node API must know python executable path (venv), handle non-zero exit loudly (aligns with root-cause rule), timeout long runs (phone photos + DL).
- **Security**: sidecar binds localhost only; no need to expose Python to LAN for personal use.
- **Output format**: host currently emits **JPEG for vision** (prepReceiptImage); classical binarize yields 1-channel — wrapper should re-expand to RGB/JPEG if downstream expects color vision input.

### Typical one-function shapes (Python)

```python
# CLI for child_process (classical)
def prep_receipt(image_bytes: bytes, *, color: bool = True) -> bytes: ...

if __name__ == "__main__":
    import sys
    out = prep_receipt(sys.stdin.buffer.read())
    sys.stdout.buffer.write(out)
```

```python
# FastAPI sidecar (persistent)
@app.post("/prep")
async def prep(file: UploadFile) -> Response:
    result = prep_receipt(await file.read())
    return Response(content=result, media_type="image/jpeg")
```

## Provenance

| ID | Source | Retrieved |
|----|--------|-----------|
| W1 | https://pypi.org/project/opencv-python/ | 2026-08-31 |
| W2 | https://docs.opencv.org/5.0/py_tutorials/py_setup/py_pip_install/py_pip_install.html | 2026-08-31 |
| W3 | https://pypi.org/project/scikit-image/ | 2026-08-31 |
| W4 | https://scikit-image.org/docs/stable/api/skimage.transform.html | 2026-08-31 |
| W5 | https://pypi.org/project/imutils/ | 2026-08-31 |
| W6 | https://github.com/PyImageSearch/imutils | 2026-08-31 |
| W7 | https://pyimagesearch.com/2014/09/01/build-kick-ass-mobile-document-scanner-just-5-minutes/ | 2026-08-31 |
| W8 | https://learnopencv.com/automatic-document-scanner-using-opencv/ | 2026-08-31 |
| W9 | https://pypi.org/project/pillow/ | 2026-08-31 |
| W10 | https://pypi.org/project/python-doctr/ | 2026-08-31 |
| W11 | https://mindee.github.io/doctr/using_doctr/using_models.html | 2026-08-31 |
| W12 | https://mindee.github.io/doctr/modules/io.html | 2026-08-31 |
| W13 | https://pypi.org/project/paddleocr/ | 2026-08-31 |
| W14 | https://github.com/PaddlePaddle/PaddleOCR/blob/main/tools/infer/utility.py | 2026-08-31 |
| W15 | http://www.paddleocr.ai/v3.3.0/en/version3.x/module_usage/text_detection.html | 2026-08-31 |
| W16 | https://pypi.org/project/albumentations/ | 2026-08-31 |
| W17 | https://albumentations.ai/docs/faq/ | 2026-08-31 |
| W18 | https://pypi.org/project/albumentationsx/ | 2026-08-31 |
| W19 | https://pypi.org/project/kornia/ | 2026-08-31 |
| W20 | https://kornia.readthedocs.io/en/v0.7.2/geometry.transform.html | 2026-08-31 |
| W21 | http://leptonica.org/about-the-license.html | 2026-08-31 |
| W22 | https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html | 2026-08-31 |
| W23 | https://pypi.org/project/pytesseract/ | 2026-08-31 |
| W24 | https://github.com/sirfz/tesserocr | 2026-08-31 |
| W25 | https://pyodide.org/en/stable/usage/index.html | 2026-08-31 |
| W26 | https://pyodide.org/en/stable/project/roadmap.html | 2026-08-31 |
| W27 | https://www.npmjs.com/package/python-shell | 2026-08-31 |
| W28 | https://www.npmjs.com/package/@u4/opencv4nodejs | 2026-08-31 |
| W29 | https://github.com/justadudewhohacks/opencv4nodejs | 2026-08-31 |
| W30 | https://book.st-hakky.com/en/business/python-receipt-ocr-data-processing | 2026-08-31 |

## Gaps

- No single maintained PyPI package identified that exposes one `scan_document()` covering quad+warp+deskew+binarize for receipts (composition required).
- python-doctr 1.1.0 exact PyPI upload timestamp not in truncated version table (badge confirms 1.1.0 latest).
- imutils 0.5.4 exact upload date not re-fetched (PyPI JSON timeout); release is widely cited as final 2019-era.
- PaddleOCR 3.7.0 wheel platform matrix for current Windows + Python 3.12 not verified file-by-file on PyPI.
- No hands-on benchmark on host hardware for spawn vs sidecar latency with receipt fixtures.
- Receipt-on-table failure rates for classical vs DL not measured in this lane (literature/tutorials only).
- C++ direct integration (OpenCV C++ DLL, Leptonica) from Node not prototyped — only binding ecosystem surveyed.

## Stop

Wider-wave lane saturation for named libraries and Node invocation patterns. Further search likely redundant (tutorial duplicates, Stack Overflow repeats). Deeper wave should target: hands-on Windows pip install sizes, receipt fixture pass/fail for classical quad, and comparison to sharp-only / @u4/opencv4nodejs in-process options (other lanes).

## Evidence relationships

- Supports parent question “de facto Python/C++ stacks”: **OpenCV + optional imutils/scikit-image** are the documented default; Leptonica enters via Tesseract not as standalone Python scan lib.
- Supports parent criterion “one maintained library for full pipeline”: **no evidence** of such a library — pipelines are composed.
- Supports parent “Python sidecar alternative”: **viable** via child_process or localhost FastAPI with small opencv-headless venv; DL stacks viable but heavy.
- Contradicts using **Paddle/docTR det alone** as page crop: det geometry is text-box level (W14, W11).
- Contradicts **Pyodide** for server: official slower-than-native positioning (W26).
- Relates to C1 prepReceiptImage.ts: current module explicitly skips deskew; sharp cannot add perspective — external CV needed.
- Relates to parent non-goal context: prior plan deskew non-goal; this lane does not decide whether to reopen — only catalogs tools.
- **albumentationsx AGPL** may conflict with parent license criteria (MIT/Apache/BSD) if augmentation path considered.
- **GPU/DL flag**: docTR, PaddleOCR, Kornia+torch = DL/heavy; OpenCV, scikit-image, imutils, Pillow, Leptonica = classical/light (CPU).
