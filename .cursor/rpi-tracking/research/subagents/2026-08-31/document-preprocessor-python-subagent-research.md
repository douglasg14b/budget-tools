<!-- markdownlint-disable-file -->

# Lane Research: document-preprocessor Python sidecar

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Deeper |
| Lane | document-preprocessor-python |
| Status | Complete (source audit; no local pip install) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/document-preprocessor-python-subagent-research.md |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |

## Lane inputs

* Parent question: Can `document-preprocessor` (smirnovkirilll / PyPI) serve as a one-call Python sidecar from the Node API for receipt crop + perspective + enhancement?
* Wave 1 hypotheses to verify: Apache-2.0; PyPI 2026.1.8.2; Python >=3.13; OpenCV+Pillow; `process_image` / `preprocess_file` pipeline; README 100% AI-authored; Windows OK via subprocess.
* Receipt-prep constraints from parent: output may need to stay color for OpenRouter vision JPEG; fail-loud when no quad is a repo rule; Windows deploy cost matters.
* pagescan peer check: maturity, PyPI presence, weight size, whether it is a fair comparison.

## Actions

* Fetched PyPI JSON for `document-preprocessor` 2026.1.8.2 and `opencv-python` 4.12.0.88 (2026-08-31).
* Read GitHub repo metadata, `pyproject.toml`, `src/document_preprocessor/core.py`, `cli.py`, all seven `tests/` files, CI workflow (2026-08-31).
* Queried GitHub API for stars/issues on `smirnovkirilll/document_preprocessor` and `7RPlus-GmbH/pagescan`.
* Confirmed pagescan PyPI absence (404 on `pypi.org/pypi/pagescan/json`); read pagescan `pyproject.toml` and README from GitHub.
* Did not pip install into budget-tools repo.

## Source-level pipeline audit

### Metadata (Wave 1 hypotheses)

| Claim | Verdict | Evidence |
|-------|---------|----------|
| Apache-2.0 | Confirmed | PyPI `license_expression`; GitHub `license.key` = apache-2.0 |
| PyPI 2026.1.8.2 | Confirmed | PyPI release 2026-01-08; `__version__` in `__init__.py` |
| Python >=3.13 | Confirmed in metadata; not required by code | `requires-python = ">=3.13"` in pyproject; CI uses 3.13 only; source uses `str \| Path` (3.10+) and std typing only — no 3.13-only syntax found |
| OpenCV + Pillow + numpy | Confirmed | `dependencies`: opencv-python>=4.12.0.88, Pillow>=12.0.0, numpy>=2.2.6 |
| README flags 100% AI-authored | Confirmed | PyPI long_description and README CAUTION block: ChatGPT 5.1 / Sonnet 4.5, 100% AI participation |
| Stars / issues | 0 stars, 0 open issues, 0 total issues | GitHub API 2026-08-31 |
| Tests exist | Yes, thin | 7 test modules; CI runs `pytest --cov` on Ubuntu Python 3.13; codecov badge in README |

### Pipeline: real OpenCV or stub?

**Real classical CV, not a stub.** `core.py` (~710 lines) calls OpenCV and Pillow directly:

1. **EXIF** — `PIL.ImageOps.exif_transpose` (`load_and_fix_exif`).
2. **Quad detect** — downscale to `max_proc_dim` (default 1000), `cv2.GaussianBlur`, `cv2.Canny`, `cv2.findContours`, top-10 by area, `cv2.approxPolyDP` for 4-point contours, filters on `min_page_area_ratio` (0.2) and `min_rectangularity` (0.7).
3. **Warp** — `order_points`, `cv2.getPerspectiveTransform`, `cv2.warpPerspective` on full-resolution BGR.
4. **Grayscale** — `img.convert("L")`.
5. **Resize** — downscale if long side > `target_long_side_px` (default 3500).
6. **Contrast + denoise** — `ImageEnhance.Contrast`, optional `ImageFilter.MedianFilter`.
7. **Binarize** — custom NumPy Otsu (`otsu_threshold`) or `cv2.adaptiveThreshold` (Gaussian).
8. **Morphology** — optional `cv2.morphologyEx` OPEN/CLOSE on binary.
9. **Sharpen** — `ImageFilter.UnsharpMask` on binary output.
10. **Save** — `img.save(..., dpi=(dpi, dpi))`.

`process_image` chains all steps including binarize (no skip flag). Step-wise public methods allow custom pipelines (README example stops before binarize only by manual composition).

**Not present:** content orientation / 180° OSD, receipt-specific tuning, glare-specific handling, ML detection/segmentation.

### Default output: color vs binary

* **`process_image` / `preprocess_file` default path → binary grayscale (`mode "L"`).** `test_pipeline_single.py` explicitly asserts `out.mode == "L"`.
* README and PyPI text target "black-and-white documents" for OCR engines.
* **Color for vision JPEG is not a first-class option.** No `skip_binarize` or `output_mode=color` config. Achievable only by bypassing `process_image` and calling steps manually (e.g. `load_and_fix_exif` → `detect_and_warp_document` → `enhance_contrast_and_denoise` on RGB before `to_grayscale`, or enhance on warped RGB and save as JPEG). CLI has no flag to skip binarization.

### Fail-loud when no quad?

**No — silent pass-through, contradicts parent fail-loud criterion.**

* `detect_and_warp_document`: if no contour passes filters, logs debug message and **returns original `pil_img` unchanged** (core.py ~414–416).
* Perspective transform exception: logs warning and **returns original image** (~452–453).
* `preprocess_file` then continues full pipeline (grayscale, binarize, etc.) on the uncropped original — **no `DocumentProcessingError`, exit code 0**.
* `DocumentProcessingError` is raised for unreadable input files and unexpected exceptions in `preprocess_file`, not for geometry failure.
* Node sidecar cannot detect "no crop" from exit code alone without a wrapper script or post-hoc dimension/heuristic check.

### Python 3.13 requirement

* **Packaging/CI choice, not a demonstrated language need.** `requires-python = ">=3.13"` and CI `python-version: "3.13"` only.
* Source is compatible with 3.10+ syntax; no `typing` 3.13 features, no free-threading APIs.
* Practical effect: forces Python 3.13 venv on Windows for `pip install document-preprocessor` even though code likely runs on 3.10–3.12 with metadata relaxed.

### Windows wheels

| Package | Wheel situation (2026-08-31) |
|---------|------------------------------|
| `document-preprocessor` | `py3-none-any` pure Python wheel (~23 KB) — platform-independent |
| `opencv-python` 4.12.0.88 (pinned min) | `opencv_python-4.12.0.88-cp37-abi3-win_amd64.whl` — **abi3 wheel works on Python 3.13 Windows** (no cp313-tagged wheel needed) |
| `Pillow` / `numpy` | Standard manylinux/win wheels on PyPI for 3.13 |

Windows deploy path: install Python 3.13, `pip install document-preprocessor` (pulls opencv-python + deps). No compiler required for default stack.

### Test quality

| Test file | What it covers | Real photos? |
|-----------|----------------|--------------|
| `test_geometry.py` | `detect_and_warp_document` on synthetic full-frame white rectangle | No |
| `test_pipeline_single.py` | End-to-end file write; asserts binary `L` mode | Synthetic gradient + line |
| `test_otsu.py` | Custom Otsu vs two-level synthetic image | No |
| `test_config.py` | Profile + env override | N/A |
| `test_pipeline_directory.py` | Directory batch (small) | No |
| `test_cli.py` (~21 KB) | CLI/env parsing, exit codes — **mostly mocked `DocumentPreprocessor`** | No |

**Gap:** no fixture images of phone receipts, skewed pages, or failure cases. Geometry test does not prove contour pipeline on realistic edges.

## Node invocation

### Built-in interface

* **Console script:** `document_preprocessor` (entry `document_preprocessor.cli:run_from_cli` in pyproject).
* **File-based only** — no stdin/stdout image protocol, no JSON RPC, no base64 pipe.
* **Single file:** `document_preprocessor --input-file <in> --output-file <out> [--profile default] [--verbose]`
* **Env alternative:** `DOC_PREPROC_INPUT_FILE`, `DOC_PREPROC_OUTPUT_FILE`, `DOC_PREPROC_PROFILE`, plus many `DOC_PREPROC_*` tuning vars.
* **Exit codes:** 0 success; 1 on `DocumentProcessingError` or batch failures; 2 argparse errors.
* **Library import:** `from document_preprocessor import DocumentPreprocessor, PreprocessorConfig` — same pipeline, usable from a thin wrapper script if Node needs color output or quad-failure signaling.

### Typical Node `child_process` pattern

```
// Conceptual — not product code
import { spawn } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const inPath = join(tmpdir(), 'receipt-in.jpg');
const outPath = join(tmpdir(), 'receipt-out.png');
await writeFile(inPath, jpegBuffer);

await new Promise((resolve, reject) => {
  const p = spawn('document_preprocessor', [
    '--input-file', inPath,
    '--output-file', outPath,
    '--profile', 'shadows',
  ], { env: { ...process.env } });
  p.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
});

const out = await readFile(outPath); // binary PNG/JPEG per extension
```

**Integration costs for this repo:**

* Requires Python 3.13 + pip venv on Windows host (or container); not pnpm-addable.
* Temp file I/O per receipt (or persistent sidecar daemon with custom wrapper — not provided).
* Default output is binary — vision path needs custom wrapper script or forked step chain.
* No quad-failure signal without wrapper comparing warp debug metadata or wrapping `detect_and_warp_document` to raise on `page_contour is None`.
* Cold-start: spawn-per-request adds process overhead; long-lived Python worker possible but not upstream.

## pagescan note

| Dimension | document-preprocessor | pagescan (7RPlus-GmbH) |
|-----------|----------------------|-------------------------|
| PyPI | Yes (`document-preprocessor` 2026.1.8.2) | **No** — `pypi.org/pypi/pagescan` 404; README: "Not on PyPI yet — install from source" |
| GitHub stars | 0 | **2** (API 2026-08-31) |
| Status | Published PyPI, Jan 2026 | Pre-release 0.1.0 in pyproject; README "in development" |
| Detection | Classical Canny + 4-pt contour | ONNX corner heatmaps (FastViT/LCNet default); optional YOLO+HQ-SAM cascade (`use_cascade=True`, `[ml]` extras) |
| Orientation | None | CNN + optional Tesseract cross-check |
| Enhancement | Contrast, median, binarize, morphology, unsharp | Shadow removal, white balance, contrast, unsharp; `--raw` = crop+perspective only |
| Default output | Binary image (PNG/TIFF via extension) | **PDF** (A4 @ 300 DPI); not JPEG-for-vision |
| Weights | None (OpenCV only) | Hugging Face `7rplus/pagescan-weights`; README cites **~50 MB** first download (legacy ONNX set); HF repo lists larger individual files (e.g. SAM 362 MB for optional cascade) |
| Python | >=3.13 (metadata) | >=3.9 per pyproject |
| License | Apache-2.0 | MIT (weights Apache-2.0) |

**Peer assessment:** pagescan is **not a peer at the same maturity tier** for a drop-in sidecar evaluation. It targets a heavier ML document-scanner product (PDF out, HF weights, git-only install, pre-release, 2 stars, optional torch/SAM). It is architecturally closer to "scanbot-class" local scanner than to a lightweight OpenCV preprocessor. Useful as a **contrast case** (better orientation/enhancement ambition, worse deploy weight and release readiness), not as an equivalent one-call option to validate alongside document-preprocessor today.

## Gaps

* No hands-on run on real receipt photos (quality, latency, quad hit rate on thermal/crumpled receipts).
* No verification that manual color-only step chain preserves acceptable vision JPEG quality vs current `prepReceiptImage` sharp path.
* Codecov coverage percentage not fetched (badge present; numeric coverage unknown).
* pagescan not exercised; weight download size depends on code path (`use_cascade` vs legacy).
* Whether `pip install document-preprocessor` works on Python 3.12 with `--ignore-requires-python` not tested (metadata blocks install).
* 180° content orientation remains unsolved by document-preprocessor (parent open question).

## Stop

Lane objectives for Cycle 1 Wave Deeper are satisfied: source confirms real OpenCV pipeline, binary default, silent no-quad behavior, 3.13 as packaging gate, Windows wheel path via abi3 opencv, CLI file-based Node integration shape, and pagescan immaturity vs peer status. Further cycles would need fixture-based quality benchmarks or a thin wrapper POC — out of scope for source-only research.

## Evidence relationships

* Supports parent W20 (document-preprocessor metadata and pipeline claims) with source-level confirmation and corrections (0 stars not "low community", silent no-quad).
* Contradicts parent fail-loud requirement (W24/W25 context): document-preprocessor fails **silent** on missing quad.
* Contradicts vision-JPEG-as-default: `process_image` is OCR-binary-first; color requires custom composition.
* Supports parent W21 (pagescan git-only, ~2 stars, heavy) and refines weight claim: README ~50 MB default vs larger optional cascade assets on HF.
* Relates to parent Q9 (Windows deploy): abi3 opencv win_amd64 + py3-none-any package = feasible Windows pip stack under Python 3.13.
* Upstream for Node lane comparison: lighter than pagescan; no orientation; geometry comparable to jscanify/scanic class contour approach.

### Claim bullets (URL + retrieval 2026-08-31)

* Apache-2.0, PyPI 2026.1.8.2, requires-python >=3.13 — https://pypi.org/project/document-preprocessor/2026.1.8.2/
* 0 stars, 0 issues, created 2025-12-22, pushed 2026-01-08 — https://api.github.com/repos/smirnovkirilll/document_preprocessor
* Real pipeline in core.py: Canny, approxPolyDP, warpPerspective, adaptiveThreshold, morphology — https://github.com/smirnovkirilll/document_preprocessor/blob/main/src/document_preprocessor/core.py
* Default output mode L (binary); test asserts — https://github.com/smirnovkirilll/document_preprocessor/blob/main/tests/test_pipeline_single.py
* No quad → return original image (debug log only) — core.py lines 414–416 — https://github.com/smirnovkirilll/document_preprocessor/blob/main/src/document_preprocessor/core.py
* CLI entry `document_preprocessor`, file in/out, exit 1 on DocumentProcessingError — https://github.com/smirnovkirilll/document_preprocessor/blob/main/pyproject.toml , cli.py
* opencv-python 4.12.0.88 win_amd64 abi3 wheel — https://pypi.org/project/opencv-python/4.12.0.88/
* pagescan 2 stars, not on PyPI, pre-release 0.1.0 — https://api.github.com/repos/7RPlus-GmbH/pagescan , https://raw.githubusercontent.com/7RPlus-GmbH/pagescan/main/README.md
* pagescan weights repo (file sizes) — https://huggingface.co/7rplus/pagescan-weights
