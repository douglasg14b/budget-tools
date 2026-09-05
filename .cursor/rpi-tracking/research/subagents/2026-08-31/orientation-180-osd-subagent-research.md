<!-- markdownlint-disable-file -->

# Lane Research: 180° / content orientation (OSD)

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Deeper |
| Lane | 180-degree / rotate-to-vertical content orientation without restoring tesseract.js as extract engine |
| Posture | expansive |
| Status | Complete (cycle 1 wave 2) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/orientation-180-osd-subagent-research.md |
| Parent artifact | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (read-only) |

## Lane inputs

- Parent brief: Node API receipt prep must correct content orientation (0/90/180/270) after EXIF; tesseract.js must not return as the extract OCR engine; sharp `.rotate()` already handles EXIF (C1, C2).
- Wave 1 pointer: deskew-perspective-orientation lane classified Tesseract OSD 180° as unreliable on short/digit-heavy text (W30); neural docorient and Paddle doc_ori noted but not depth-checked.
- Lane questions: installable Node or small Python libs for 0/90/180/270; docorient license/size/Windows/Node-callability/accuracy; Paddle doc_ori weight/CPU/overkill; OpenRouter vision upside-down tolerance; projection-profile / text-line Hough packaging for 90 vs 180; fail-loud vs EXIF-only skip when OSD confidence low.
- Internal anchor: `prepReceiptImage.ts:39` — `.rotate()` with no angle (EXIF auto-orient only). Vision prompts in `receiptHeaderVision.ts:84-110` assume readable upright text; no orientation instruction.

## Actions

- Fetched docorient PyPI JSON 0.4.1 and GitHub README (license, deps, model size, accuracy claims, `reliable` API, Windows multiprocessing note).
- Fetched PaddleOCR v3.5.0 doc_img_orientation_classification module page (PP-LCNet_x1_0_doc_ori size, accuracy, CPU/GPU timings, scores in predict output).
- Fetched Leptonica flipdetect.c API docs (`pixOrientDetect`, `pixUpDownDetect`, `pixUpDownDetectGeneral`, 1 bpp / 150–300 ppi prerequisites).
- Fetched Tesseract GitHub issues #4172 (wrong 180°, confidence 1.45), #4409 (low confidence, "Too few characters"), #2913 (production brute-force OCR-at-four-angles fallback; Leptonica pixUpDownDetect also failed for reporter).
- Fetched Tesseract tessdoc APIExample (OSD via `AnalyseLayout` / orientation degrees 0/90/180/270).
- Fetched ppu-doc-correction npm 1.0.1 registry metadata and GitHub README (DocOrientService, TextOrientService 0/180, ONNX models, M1 benchmark ~138 ms, peer `onnxruntime-node`).
- Fetched document-preprocessor PyPI README (EXIF only via `exif_transpose`; no content OSD).
- Fetched docTR using_models page (optional `straighten_pages` / `detect_orientation` / `page_orientation_predictor` — OCR stack, not prep-only).
- Reviewed arXiv 2511.04161 "Seeing Straight" (VLM rotation-classification and OCR-without-correction tables; GPT-4o baseline).
- Web search for VLM upside-down robustness (DEV community benchmark; flagged unverified for this product).
- Confirmed apps/api vision prompts do not mention rotation.

## Candidate table

| Candidate | Install | 0/90/180/270 | 180° / receipt fit | Size / CPU (vendor) | Windows | Node-callable | License | Confidence gate | Notes |
|-----------|---------|--------------|-------------------|---------------------|---------|---------------|---------|-----------------|-------|
| sharp `.rotate()` (current) | already in apps/api | EXIF metadata only | No content 180° when EXIF absent/wrong | negligible | yes (prebuilt libvips) | native | Apache-2.0 | n/a | Correct layer; not content OSD. https://sharp.pixelplumbing.com/api-operation/#rotate |
| **docorient** 0.4.1 | `pip install docorient` | yes | Trained on receipts per README; energy axis + MobileNetV2 flip for 0 vs 180 within axis | ~8.5 MB embedded ONNX in wheel (~8.24 MB PyPI wheel); ~20 ms/image CPU (README claim) | yes; README warns `process_directory` needs `if __name__ == "__main__"` on Windows/macOS for multiprocessing | **subprocess / Python sidecar only** (PyPI, no npm) | MIT | `OrientationResult.reliable`; `flip_confidence_threshold` default 0.50 | Vendor claims 98% combined / 96.8% flip standalone — **not independently verified on receipt fixtures**. https://pypi.org/project/docorient/ , https://github.com/lucasleirbag/DocOrient |
| **ppu-doc-correction** `DocOrientService` 1.0.1 | `npm install ppu-doc-correction` + peer `onnxruntime-node` | yes (PP-LCNet_x1_0_doc_ori) | Same Paddle doc_ori model family as Python PaddleOCR | Model lazy-download; README bench ~138 ms/run on Apple M1 (includes session); 224×224 input | plausible via `onnxruntime-node` 1.29.0 prebuilds (not hands-on in this lane) | **yes — in-process Node** | MIT | `result.scores` softmax vector; no documented min threshold in README | Smallest Node-native 4-class OSD found. `TextOrientService` is **0/180 only** on text-line crops, not full page. https://www.npmjs.com/package/ppu-doc-correction , https://github.com/PT-Perkasa-Pilar-Utama/ppu-doc-correction |
| PaddleOCR `DocImgOrientationClassification` / CLI `doc_img_orientation_classification` | `pip install paddleocr` (+ paddlepaddle) | yes | Module purpose is document/ID photos before OCR; test set is vendor 1000-image ID/document mix — **not receipt-specific** | Model **7 MB**; CPU inference **3.24 ms** normal mode (Intel Gold 6271C, vendor table); end-to-end ~5.74 ms on A100 demo image | supported but heavy Python + paddle install | subprocess / Python sidecar | Apache-2.0 | `scores` per predict (example 0.88 for 180° demo) | **Likely overkill for prep-only** if only orientation is needed: pulls full PaddleOCR ecosystem unless isolated module + static model. https://www.paddleocr.ai/v3.5.0/en/version3.x/module_usage/doc_img_orientation_classification.html |
| Tesseract OSD `--psm 0` / API `PSM_AUTO_OSD` | tesseract binary or lib | yes | **Poor on short/digit-heavy receipts** (issues) | fast when it works | yes (common Windows builds) | subprocess or native binding — **not wanted as extract engine**; OSD-only subprocess is still a design option | Apache-2.0 | confidence often low or wrong at 180° (#4172 orientation confidence 1.45; #4409 0.03) | Restoring tesseract **for extract** is out of scope; OSD-only CLI is separate. Maintainer workaround: `-c min_characters_to_try=200`, `-l eng` (#4172). https://tesseract-ocr.github.io/tessdoc/APIExample.html , https://github.com/tesseract-ocr/tesseract/issues/4172 |
| Leptonica `pixOrientDetect` / `pixUpDownDetect` | C lib (bundled with Tesseract); **pyleptonica 0.8** stale ctypes wrapper | yes (4-way via up+left conf table; 180 via up/down) | Requires **1 bpp**, deskewed, **150–300 ppi**, Roman text; `pixUpDownDetectGeneral(npixels>0)` for digit-heavy pages | fast C | via Tesseract/Leptonica binaries | no maintained Node binding; Python via ctypes/pyleptonica | BSD (Leptonica) | normalized upconf/leftconf thresholds (not 0–1 probability) | Projection/Hough **deskew** is separate (`skew.c`). Production report (#2913): pixUpDownDetect failed vs brute-force OCR. https://tpgit.github.io/Leptonica/flipdetect_8c.html , https://github.com/tesseract-ocr/tesseract/issues/2913 |
| sbrunner/deskew 1.6.1 | `pip install deskew` | **no** (small-angle ±45° or ±90° deskew, not 4-way OSD) | wrong tool for 180° content flip | light | yes | subprocess | MIT | angle confidence implicit | Hough line peaks — packaged deskew only. https://pypi.org/project/deskew/ |
| docTR `straighten_pages` / `page_orientation_predictor` | `pip install python-doctr` | partial (page rotation for OCR) | OCR framework; PyTorch weight | heavy | yes but large | subprocess | Apache-2.0 | model confidence fields | Wrong default tool for vision-only prep. https://mindee.github.io/doctr/using_doctr/using_models.html |
| document-preprocessor | PyPI | EXIF only | no content OSD | opencv-python stack | yes (3.13+) | subprocess | Apache-2.0 | n/a | Explicitly EXIF transpose step only. https://pypi.org/project/document-preprocessor/ |
| OpenRouter vision (current extract) | existing | **no dedicated OSD** | prompts assume readable receipt | paid API latency/cost | n/a | already used | n/a | n/a | See vision evidence section — **OSD not optional** if upside-down is possible. |

### Projection-profile / text-line Hough for 90° vs 180° — where packaged

| Mechanism | What it distinguishes | Packaged where | 90 vs 180? |
|-----------|----------------------|----------------|------------|
| Differential projection profile | small skew angle (not 4-way) | Leptonica `skew.c`; sbrunner/deskew (Hough); ImageMagick `-deskew` | **No** — deskew only |
| Ascender/descender HMT (up vs down) | 0° vs 180° after axis known | Leptonica `pixUpDownDetect*` in flipdetect.c | **180 only** (needs prior horizontal text) |
| upconf vs leftconf table | 0/90/180/270 | Leptonica `pixOrientDetect` + `makeOrientDecision` | **Yes** — classical 4-way; strict input contract |
| Horizontal vs vertical energy | 0/180 vs 90/270 axis | docorient `PrimaryEngine` (NumPy, README ~97% axis) | **Axis only**; 180 needs flip classifier |
| CNN 4-class | 0/90/180/270 | docorient combined; Paddle PP-LCNet; ppu-doc-correction DocOrientService | **Yes** — primary modern packaged path |
| Text-line 2-class | 0 vs 180 on crops | ppu-doc-correction `TextOrientService` (PP-LCNet_x0_25_textline_ori) | **180 only** on line patches |
| Hough text-line angle | near-horizontal vs vertical | sbrunner/deskew, OpenCV recipes | **No** for 180° flip |

**Lane finding:** no maintained **npm** package exposes classical projection/Hough 4-way OSD; the packaged non-neural path is **Tesseract/Leptonica binaries**, which Wave 1 already flagged as weak on receipts.

## vision-upside-down evidence (flag speculation)

### Sourced (external)

| ID | Claim | Source | Retrieved | Confidence |
|----|-------|--------|-----------|------------|
| V1 | Dedicated rotation classifiers outperform VLMs on 4-way document rotation: proposed model 96.81% ORB-En vs GPT-4o 59.58%; docTR 63.28%; TrOCR 26.22% | arXiv 2511.04161 Table 2 | 2026-08-31 | high (peer-reviewed preprint) |
| V2 | On ORB-En-SROIE field OCR: GPT-4o **36.09%** upright vs **29.10%** with rotation (no correction); Tesseract **49.06%** upright vs **24.06%** with rotation; pipeline with rotation correction restores Tesseract toward 48.99% | arXiv 2511.04161 Table 3 | 2026-08-31 | high |
| V3 | Paper states OCR pipelines "often rely on clean inputs without dedicated mechanisms to ensure robust orientation handling" and misalignment causes repetitions/hallucinations (Figure 1) | arXiv 2511.04161 | 2026-08-31 | high |
| V4 | Tesseract OSD can report 180° with very low confidence on upright short text (confidence 1.45); `-c min_characters_to_try=200` and `-l eng` changed result to 0° (#4172) | GitHub tesseract #4172 | 2026-08-31 | high |
| V5 | Large-scale production team: Tesseract OSD, Leptonica pixUpDownDetect, and TessPageIteratorOrientation "without much success" on monospace/low quality; adopted brute-force OCR at 0/90/180/270 (#2913) | GitHub tesseract #2913 | 2026-08-31 | medium (anecdotal but detailed) |

### Internal (codebase)

| ID | Claim | Location | Confidence |
|----|-------|----------|------------|
| C9 | Vision system prompt: "Extract receipt match keys from the photo" — no instruction to handle rotation or read upside-down text | apps/api/src/features/receipts/pipeline/receiptHeaderVision.ts:84 | high |
| C10 | Processed JPEG (post-EXIF-only prep) is the sole image sent to vision | apps/api/src/features/receipts/extractReceipt.ts:84 (parent C5) | high |

### Unverified / speculative (flagged)

| Claim | Basis | Flag |
|-------|-------|------|
| OpenRouter models used in this repo match GPT-4o upside-down degradation (~25% at 180°) | DEV community n=12 benchmark on Claude 3.5 Sonnet / GPT-4o (dev.to article cited in search); **not** the repo's configured model; no OpenRouter vendor doc on rotation invariance fetched (docs URL 404) | **unverified for budget-tools** |
| Skipping OSD is safe because vision will "figure it out" | Contradicted by V1–V3 for GPT-4o-class VLMs on document OCR tasks; internal prompts do not ask for rotation handling (C9) | **speculation — treat OSD as non-optional when EXIF cannot fix orientation** |
| docorient 98% / Paddle 99.06% transfer to narrow thermal receipt photos | Vendor datasets include receipts (docorient README) and ID/docs (Paddle); no receipt-fixture benchmark in this lane | **unverified on product fixtures** |

**Lane answer:** OpenRouter vision is **not** documented as rotation-invariant; published VLM document-OCR evidence shows large upright vs rotated gaps. For this product, content OSD remains **important** when EXIF does not encode capture rotation (common for thermal receipt photos per Wave 1 deskew lane).

## Fail-loud vs skip (EXIF-only when confidence low)

| Approach | Behavior | Fits root-cause-over-workarounds? | Evidence |
|----------|----------|-----------------------------------|----------|
| **Skip OSD when confidence low** — leave sharp EXIF-only output | Avoids wrong 180° rotation that would garble vision | **Yes** — wrong rotation is worse than upside-down for some VLMs (V2 shows some models still extract partial signal); aligns with "no silent wrong state" | Tesseract low-confidence mis-OSD (#4172, #4409); docorient `reliable` false path; Paddle `scores` thresholding |
| **Fail-loud abort** when upside-down suspected but OSD unreliable | User must retake photo | Valid product choice but blocks extract on ambiguous orientation | Parent fail-loud theme for missing quad (W24) — analogous for OSD only if product requires correction |
| **Always rotate to OSD best guess** | Risk flips readable receipt to unreadable | **No** — classic OSD errors at 180° on short text | #4172, #2913 |
| **Brute-force vision/OCR at 4 angles** | Pick best scoring orientation | Works (#2913) but 4× cost; uses OCR/tesseract not vision-only | #2913 |

**Lane finding (non-decision):** When OSD confidence is below threshold or `reliable=false`, **leaving EXIF-only rotation** is the conservative default supported by vendor confidence semantics and Tesseract failure modes. Optional explicit warning in extract metadata is a product choice outside this lane.

## Gaps

- No hands-on benchmark on budget-tools receipt fixtures for docorient vs ppu-doc-correction vs EXIF-only + vision.
- `onnxruntime-node` Windows install and cold-start model download for ppu-doc-correction not exercised on this machine.
- docorient `reliable` exact rules not traced in source (README/docstring only).
- OpenRouter-specific model card for the repo's configured vision model not fetched; V1–V3 use GPT-4o / Gemini baselines, not necessarily the same endpoint.
- Whether thermal receipt digit density triggers Leptonica `pixUpDownDetectGeneral` success — untested.
- Paddle doc_ori isolated from full `paddleocr` install size not measured.

## Stop

Wave 2 deeper lane saturated for installable OSD catalog, vendor accuracy/size claims, VLM rotation evidence, and fail-loud/skip framing. Further work needs fixture-driven accuracy and Windows deploy smoke test, not more registry trawling.

## Evidence relationships

- **Parent C1/C2 + prepReceiptImage** → EXIF layer done; this lane supplies content OSD options for missing/wrong EXIF.
- **Parent W30 + Tesseract #4172/#4409** → confirms restoring tesseract as extract engine is unnecessary for OSD research, but also shows Tesseract OSD-only subprocess is weak on receipt-like pages.
- **deskew-perspective Wave 1** → neural OSD candidates listed; this lane adds docorient wheel size, ppu-doc-correction Node path, Paddle CPU numbers, and VLM evidence.
- **ppu-doc-correction ↔ Paddle doc_ori** → same PP-LCNet_x1_0_doc_ori model class; Node ONNX wrapper vs Python PaddleInference are deploy alternatives, not accuracy guarantees.
- **docorient two-stage** → maps to classical split: energy/projection-like axis (90 vs 270 family) + flip classifier (0 vs 180); explains why pure projection-profile npm packages do not solve 180 alone.
- **Vision extract C9/C10 + V1–V3** → prep module should not assume vision compensates for 180°; OSD or accept EXIF-only skip.
- **Fail-loud policy** → low-confidence OSD should not apply rotation; parallels quad detect fail-loud vs silent skip (parent W24).

## Provenance

| Source | URL | Used for |
|--------|-----|----------|
| docorient PyPI 0.4.1 | https://pypi.org/project/docorient/ | license MIT, wheel size, deps, Python >=3.10 |
| DocOrient README | https://github.com/lucasleirbag/DocOrient | pipeline, accuracy claims, Windows note, API |
| PaddleOCR doc orientation module | https://www.paddleocr.ai/v3.5.0/en/version3.x/module_usage/doc_img_orientation_classification.html | 7 MB, 99.06%, CPU ms, scores |
| Leptonica flipdetect | https://tpgit.github.io/Leptonica/flipdetect_8c.html | pixUpDownDetect, pixOrientDetect prerequisites |
| Tesseract #4172 | https://github.com/tesseract-ocr/tesseract/issues/4172 | wrong 180°, min_characters_to_try |
| Tesseract #4409 | https://github.com/tesseract-ocr/tesseract/issues/4409 | low confidence, too few characters |
| Tesseract #2913 | https://github.com/tesseract-ocr/tesseract/issues/2913 | Leptonica failure, brute-force fallback |
| Tesseract APIExample | https://tesseract-ocr.github.io/tessdoc/APIExample.html | OSD degrees API |
| ppu-doc-correction npm | https://www.npmjs.com/package/ppu-doc-correction | Node OSD service, peer deps |
| ppu-doc-correction README | https://github.com/PT-Perkasa-Pilar-Utama/ppu-doc-correction | models, benchmark, TextOrient 0/180 |
| document-preprocessor PyPI | https://pypi.org/project/document-preprocessor/ | EXIF only |
| docTR using models | https://mindee.github.io/doctr/using_doctr/using_models.html | straighten_pages / orientation predictors |
| arXiv 2511.04161 | https://doi.org/10.48550/arxiv.2511.04161 | VLM rotation classification vs OCR degradation |
| sharp rotate | https://sharp.pixelplumbing.com/api-operation/#rotate | EXIF behavior |
| prepReceiptImage | apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:39 | current EXIF rotate |
| receiptHeaderVision | apps/api/src/features/receipts/pipeline/receiptHeaderVision.ts:84-110 | no orientation prompt |
| Parent W30 | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md | Wave 1 OSD risk |
