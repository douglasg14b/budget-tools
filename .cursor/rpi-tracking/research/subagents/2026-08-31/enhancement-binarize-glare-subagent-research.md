<!-- markdownlint-disable-file -->

# Lane: enhancement (binarize / sharpen / local brightness / glare)

| Field | Value |
|-------|-------|
| Cycle | 1 |
| Wave | Wider |
| Parent artifact | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (not edited) |
| Lane artifact | .cursor/rpi-tracking/research/subagents/2026-08-31/enhancement-binarize-glare-subagent-research.md |
| Posture | Expansive external library and vendor guidance |
| Status | Complete (cycle 1 wave 1) |
| Retrieval date | 2026-08-31 |

## Lane inputs

* Topic: Binarization, sharpening, local brightness/contrast, and glare reduction for receipt/document cleanup — libraries, algorithms, and whether they help classic OCR vs modern vision LLMs.
* Host fact (from parent/repo lane): extract currently sends color JPEG to OpenRouter vision after prepReceiptImage (sharp rotate + normalise + resize + stitch); tesseract.js removed; caller still asked for binarize/sharpen/glare work for OCR readiness.
* Questions: algorithm packaging (Otsu, adaptive Gaussian, Sauvola, Wolf, Niblack, leptonica, ocropy, kraken); sharpen (sharp/OpenCV/PIL); local brightness (CLAHE, Retinex, gamma, normalise); glare (inpainting, highlight clipping, homomorphic); 2023–2026 document-enhancement OSS usability; OCR vendor preprocess guidance; dual-output (color vision + binary OCR) pattern.
* Non-goals: stack selection; implementation; editing parent artifact.

## Actions

| Action | Target |
|--------|--------|
| Read parent brief and repo prep lane pointer | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md; apps/api/src/features/receipts/pipeline/prepReceiptImage.ts |
| Web/doc fetch | Tesseract tessdoc ImproveQuality; OpenCV thresholding + CLAHE + inpainting; scikit-image filters; Leptonica binarize.c; kraken/ocropy binarization docs; sharp api-operation; PaddleOCR inference args; Google Document AI enterprise OCR; Apple Vision WWDC19 + community guides; OCRmyPDF/unpaper; document enhancement repos (GCDRNet, DE-GAN, NAF-DPM, GL-PGENet, DocSHRNet, UnReflectAnything); vision-LLM OCR papers/posts |
| Cross-check Node host constraint | apps/api/package.json sharp ^0.35.4; sharp exposes normalise, clahe, sharpen, global threshold only |

## Algorithm / library table

| Technique | Algorithms / API | Packaged where | Node (sharp) | Python / C++ | Receipt / doc notes | Classic OCR tilt | Vision LLM tilt |
|-----------|------------------|----------------|--------------|--------------|---------------------|------------------|-----------------|
| Global Otsu | cv.threshold + THRESH_OTSU; skimage.filters.threshold_otsu; sharp.threshold (global 0–255 only, not Otsu auto) | OpenCV core; scikit-image; sharp global threshold | sharp.threshold exists but fixed cutoff, not Otsu | OpenCV, scikit-image | Good for clean uniform scans; poor on uneven lighting (OpenCV tutorial) | Helps Tesseract when external preprocess beats internal Otsu (tessdoc) | Risky alone on phone receipts |
| Adaptive mean/Gaussian | cv.adaptiveThreshold (ADAPTIVE_THRESH_MEAN_C, ADAPTIVE_THRESH_GAUSSIAN_C) | OpenCV core imgproc | Not in sharp | OpenCV | OpenCV.js receipt demo uses adaptive Gaussian before OCR (opencv.org smart-document-scanning) | Strong for uneven lighting | Keeps grayscale — safer for vision than hard binarize |
| Sauvola | pixSauvolaBinarize, pixSauvolaBinarizeTiled | Leptonica binarize.c; Tesseract 5 thresholding_method=2 (Leptonica) | No | Leptonica; scikit-image threshold_sauvola; OpenCV ximgproc niBlackThreshold with BINARIZATION_SAUVOLA | Tesseract 5 exposes Sauvola params (window_size, kfactor); tessdoc recommends for uneven background | Strong for degraded/low-contrast docs | Binary output — see vision caution |
| Adaptive Otsu (tiled) | pixOtsuAdaptiveThreshold | Leptonica; Tesseract thresholding_method=1 | No | Leptonica; Tesseract 5 | Tesseract issue #3083: segmentation uses greyscale + binarizer jointly — pre-binarizing can conflict | Helps variable lighting per Tesseract docs | Same conflict risk for vision |
| Niblack | threshold_niblack; cv.ximgproc.niBlackThreshold BINARIZATION_NIBLACK | scikit-image; OpenCV contrib ximgproc | No | scikit-image; opencv-contrib-python | More noise on uneven backgrounds vs Sauvola (scikit-image docs, tutorials) | Historical OCR pipelines | Binary — vision caution |
| Wolf | cv.ximgproc.niBlackThreshold BINARIZATION_WOLF | OpenCV contrib ximgproc only (not scikit-image __all__) | No | opencv-contrib | Document-oriented local binarization variant | OCR research / DIBCO baselines | Binary |
| NICK | cv.ximgproc BINARIZATION_NICK | OpenCV contrib | No | opencv-contrib | Low-contrast text (OpenCV ximgproc enum docs) | OCR niche | Binary |
| Ocropy nlbin | ocropus-nlbin nonlinear adaptive binarization + optional deskew | ocropy CLI (UB-Mannheim/ocropy); legacy | No | Python ocropy | Assumes 300 dpi binary black-on-white for pipeline (ocropy README); parameter-sensitive (zedlitz binarization experiment) | Strong for historical OCRopus | Legacy; not vision-oriented |
| Ocropy Sauvola | ocropus-sauvola (referenced in ocropus-steps notebook) | ocropy CLI | No | ocropy | Fast Sauvola implementation per ocropus docs | OCRopus layout/recognition | Binary |
| Kraken nlbin | kraken binarize subcommand; nlbin() in binarization.py | kraken Python package | No | kraken | kraken 5.3 docs: "Binarization is deprecated and mostly not necessary anymore. It can often worsen text recognition results especially for documents with uneven lighting, faint writing" | Legacy kraken segmenter needed binary; modern kraken recognition accepts grey or binary | Explicit warning that binarization can hurt |
| Leptonica (direct) | pixOtsuAdaptiveThreshold, pixSauvolaBinarize, pixOtsuThreshOnBackgroundNorm | C library; used by Tesseract internally | No native in repo | C / Python bindings | High-level outline lists binarize.c under adaptmap/binarize (leptonica.org) | Tesseract internal default path | N/A unless building custom OCR sidecar |
| Global contrast stretch | sharp.normalise / normalize (1–99 percentile histogram stretch) | sharp (libvips) — already used in prepReceiptImage | Yes — current prep step | PIL ImageOps, OpenCV equalizeHist (global) | Current budget-tools prep uses normalise only | Mild help; tessdoc says fix uneven lighting before binarize | Safer than binarize for vision — preserves color |
| CLAHE | cv.createCLAHE; sharp.clahe({ width, height, maxSlope }) | OpenCV imgproc; sharp since 0.28.3 | Yes — tile-based CLAHE in sharp | OpenCV; sharp | Local contrast for shadows; OpenCV receipt glare SO answer combines CLAHE + inpaint | Helps uneven illumination without full binarization | Grayscale/color CLAHE keeps tone — preferred over binarize for vision |
| Gamma | sharp.gamma; cv LUT / pow | sharp; OpenCV | Yes | OpenCV, PIL | Perceptual brightness; sharp notes JPEG shrink-on-load interaction | Secondary OCR tweak | Low risk if mild |
| Retinex / MSR | Multi-scale Retinex implementations (not in sharp core) | Various research repos; not standard in OpenCV main tutorials fetched | No first-class | Custom / opencv contrib experiments | Illumination normalization literature; no receipt-specific maintained npm package found this cycle | Can help shadowed scans | Color-preserving variants possible |
| Unsharp mask / sharpen | sharp.sharpen({ sigma, m1, m2, x1, y2, y3 }) — libvips L-channel unsharp; cv.filter2D / Gaussian unsharp patterns | sharp; OpenCV; PIL ImageFilter.UnsharpMask | Yes | OpenCV, PIL | Apple Vision rescan experiments (uitag): extreme unsharp (8x+) recovered thin strokes but garbled surrounding text on dark UI — no sweet spot for thermal-like thin strokes | Can help faint thermal if tuned lightly; overshoot breaks OCR | Oversharpening creates halos/noise that may confuse vision |
| Morphology after threshold | sharp dilate/erode; cv morphologyEx | sharp; OpenCV | Yes (dilate/erode) | OpenCV | OpenCV.js demo: closing after adaptive threshold to recover broken strokes | OCR classic pipeline step | Can thicken strokes — test on vision |
| Glare: highlight mask + inpaint | cv.threshold bright pixels (~220+) → cv.inpaint (INPAINT_TELEA / INPAINT_NS) | OpenCV photo module | No inpaint in sharp | OpenCV | Stack Overflow / Medium tutorials; document-specific DL: DocSHRNet, HAFNet (CVPR 2025), UnReflectAnything (2025–2026) | DocSHRNet paper claims OCR accuracy gains after highlight removal | Keeps color if inpainting RGB — usable for vision path |
| Glare: homomorphic filtering | Frequency-domain high-pass on log image | OpenCV + NumPy patterns (SO answers) | No | OpenCV custom | Classical uneven-illumination; less receipt-specific than inpaint+CLAHE in fetched sources | Background normalization | Color-capable |
| Glare: vendor detection only | quality/defect_glare in Document AI imageQualityScores | Google Cloud Document AI Enterprise OCR | N/A | API | Docs: glare is local; may not block readability; enableImageQualityScores for routing/HITL | Google performs internal rotation/deskew/noise reduction — no configurable binarize UI (discuss.google.dev) | Vision APIs benefit from not forcing extract on severe glare |
| Deep doc enhancement (2023–2026) | GCDRNet (pip gcdrnet, TAI 2023); DE-GAN (TPAMI, enhance.py modes); NAF-DPM (2024 diffusion); GL-PGENet (2025); DocRes; DocDiff | Mostly PyTorch research repos; GCDRNet is pip-installable with model.enhance | No — Python sidecar | PyTorch + CUDA typical | Shadow/bleed-through/watermark tasks; not receipt-specific npm libs | Intended pre-OCR; binarization modes in DE-GAN | Color enhancement outputs — could feed vision if deployed |
| Document specular highlight DL | DocSHRNet + DocHighlight dataset (github.com/shallweiwei/DocSHRNet); HAFNet CVPR 2025; UnReflectAnything (CVPR 2026 oral, pip/CLI ura) | Research code + weights | No | Python/PyTorch | DocSHRNet targets camera-captured documents and reports OCR metrics | Strong OCR motivation | RGB highlight removal — vision-compatible output |
| End-user OCR pipelines | OCRmyPDF --clean via unpaper; PaddleOCR binarize/invert optional params | OCRmyPDF (unpaper); PaddleOCR | No | Python CLI/libs | OCRmyPDF defaults conservative unpaper args; aggressive via --unpaper-args | unpaper deskew/margins, not primarily Sauvola | N/A for current vision-first extract unless dual-output |

## Vision vs OCR caution (with sources)

**Flag: binarization can hurt vision models and is not universally required for OCR anymore.**

| Claim | Source | Implication for budget-tools |
|-------|--------|------------------------------|
| Tesseract performs internal binarization (Otsu; Sauvola/adaptive Otsu in 5.0+ via Leptonica); external preprocessing only when internal result is suboptimal — inspect tessinput.tif with tessedit_write_images | github.com/tesseract-ocr/tessdoc ImproveQuality.md (linked from DeepWiki/tessdoc summaries); github.com/tesseract-ocr/tesseract issue #3083 | If local OCR returns, prefer grayscale + let engine binarize, or tune thresholding_method — don't assume external binarize always wins |
| Pre-binarized input can conflict with Tesseract segmentation that uses greyscale + binarizer edge offsets (issue #3083) | github.com/tesseract-ocr/tesseract issue #3083 | Aggressive upstream binarize may hurt engines that expect greyscale |
| Kraken documents binarization as deprecated; "can often worsen text recognition results especially for documents with uneven lighting, faint writing" | kraken.re 5.3.0 advanced docs; github.com/mittagessen/kraken binarization.py header | Direct counter to "always binarize for OCR" for modern neural OCR |
| Modern OCR engines may perform better on grayscale than hard-thresholded images for faint text, stamps, handwriting, uneven lighting — A/B both | trueocr.com scan preprocessing guide | Receipt photos often have faint thermal text and uneven lighting — grayscale/CLAHE may beat binary |
| Aggressive preprocessing can reduce accuracy; cleaner-looking ≠ better OCR; measure field accuracy not aesthetics | ocr.direct image preprocessing checklist | Applies to sharpen/binarize stacks on receipts |
| GPT-4 Vision Turbo benefited from external OCR text + image together; pixel-only setup underperformed optimized combined input (arxiv 2405.18433) | arxiv.org/html/2405.18433 | Current OpenRouter vision-only path has no OCR side channel — destroying color/contrast in binarize removes information vision might use |
| Vision LLMs downsample to encoder pixel budget; fine strokes degrade when resolution drops | llmind.org vision-llm-vs-extracted-text | Binarization does not fix downsampling; halos from oversharpen add noise at low resolution |
| GPT-4V OCR evaluation: higher input resolution correlates with better recognition (2310.16809) | arxiv.org/html/2310.16809 | Preserve readable grayscale/color and sufficient resolution before destructive ops |
| Apple Vision: downsampling to ~2000px long edge OK; extreme sharpening/contrast/threshold grids failed to recover thin strokes without garbling context (uitag ocr-rescan-experiments) | github.com/swaylenhayes/uitag docs/research/ocr-rescan-experiments.md | Thermal receipt strokes are thin — oversharpen/binarize risky for any reader |
| Google Document AI: internal auto rotation/deskew/noise reduction; quality/defect_glare for routing; severe glare → HITL not forced extraction | docs.cloud.google.com/document-ai enterprise OCR; discuss.google.dev document pre-processing | Commercial pattern: detect glare, don't always inpaint/binarize blindly |
| PaddleOCR: binarize defaults false — optional pre-threshold | paddleocr.ai inference_args (binarize, invert) | Mainstream OCR treats binarize as opt-in, not default |
| OpenRouter host today: color JPEG after normalise only (prepReceiptImage.ts:38-43) | apps/api/src/features/receipts/pipeline/prepReceiptImage.ts | Any binary branch must not replace vision JPEG without explicit dual-output contract |

**Practical split inferred from sources (not a recommendation):**

* Classic OCR path: adaptive Sauvola / adaptive Gaussian / Leptonica Sauvola when background uneven; avoid global Otsu on phone receipts; morphology closing optional for broken thermal strokes (OpenCV.js demo pattern).
* Vision path: prefer color or grayscale with CLAHE/normalise/gamma; avoid hard binarization and heavy sharpen; address glare with highlight inpainting or DL highlight removal if needed; keep resolution before downstream resize.

## Dual-output notes

| Pattern element | Evidence | Notes for one-call module shape |
|-----------------|----------|----------------------------------|
| Separate artifacts | Tesseract issue #3083 greyscale + binary both used internally; GPT-4V paper uses image + OCR text dual input | Parent unresolved decision: color vision-safe vs binary OCR-safe |
| Fork after shared geometry | OpenCV.js demo: grayscale → optional blur → adaptiveThreshold for OCR branch while color branch could remain pre-threshold | Suggested pipeline shape in literature: shared crop/deskew/perspective, then split |
| Vision payload | prepReceiptImage returns single JPEG Buffer for OpenRouter (repo lane) | Module could return `{ visionJpeg, ocrPng?, debug? }` — no repo implementation yet |
| OCR payload | ocropy/kraken historically required binary PNG; PaddleOCR accepts color with optional binarize flag | If future local OCR reintroduced, binary or high-contrast grayscale branch optional |
| Storage contract | Originals stored separately; prep never overwrites stored bytes (repo lane) | Dual outputs are extract-time only unless product adds processed cache |
| sharp capabilities for dual branch | Same sharp pipeline can `.clone()` or re-read: branch A `.jpeg()` color; branch B `.greyscale().clahe().threshold()` or `.png()` 1-bit via threshold | All Node-native without OpenCV if adaptive Sauvola not required |
| Adaptive Sauvola in Node | Not in sharp; would need opencv4nodejs, WASM OpenCV.js, or Python subprocess | Windows native-addon deploy cost flagged in parent brief |

## Provenance

| ID | Claim | URL | Retrieved |
|----|-------|-----|-----------|
| E1 | OpenCV Otsu, adaptiveThreshold mean/Gaussian | https://docs.opencv.org/4.13.0/d7/d4d/tutorial_py_thresholding.html | 2026-08-31 |
| E2 | OpenCV ximgproc Niblack/Sauvola/Wolf/NICK via niBlackThreshold | https://docs.opencv.org/4.x/group__ximgproc.html (mirrored docs.hsp.moe OpenCV453 ximgproc) | 2026-08-31 |
| E3 | scikit-image threshold_niblack, threshold_sauvola, threshold_otsu | https://scikit-image.org/docs/stable/api/skimage.filters.html | 2026-08-31 |
| E4 | Leptonica Sauvola + adaptive Otsu APIs | https://github.com/DanBloomberg/leptonica/blob/master/src/binarize.c ; http://www.leptonica.org/highlevel.html | 2026-08-31 |
| E5 | Tesseract external preprocess + Sauvola/adaptive Otsu params | https://github.com/tesseract-ocr/tessdoc/blob/main/ImproveQuality.md ; https://github.com/tesseract-ocr/tesseract/issues/3083 | 2026-08-31 |
| E6 | Kraken binarization deprecated / can worsen results | https://kraken.re/5.3.0/advanced.html | 2026-08-31 |
| E7 | ocropy nlbin + 300dpi binary assumption | https://github.com/UB-Mannheim/ocropy | 2026-08-31 |
| E8 | sharp sharpen (unsharp), normalise, clahe, global threshold | https://sharp.pixelplumbing.com/api-operation/ | 2026-08-31 |
| E9 | OpenCV CLAHE createCLAHE tutorial | https://docs.opencv.org/4.x/d5/daf/tutorial_py_histogram_equalization.html (referenced; fetch timeout — CLAHE confirmed via sharp docs + SO glare thread) | 2026-08-31 |
| E10 | OpenCV inpaint TELEA/NS | https://docs.opencv.org/5.0/py_tutorials/py_photo/py_inpainting/py_inpainting.html | 2026-08-31 |
| E11 | Glare inpainting threshold ~220 pattern | https://stackoverflow.com/questions/61121763/how-to-remove-glare-from-images-in-opencv | 2026-08-31 |
| E12 | DocSHRNet document specular highlight + OCR | https://www.springerprofessional.de/towards-real-world-document-specular-highlight-removal-the-dochi/51941750 ; https://github.com/shallweiwei/DocSHRNet | 2026-08-31 |
| E13 | HAFNet text image specular highlight CVPR 2025 | https://openaccess.thecvf.com/content/CVPR2025/papers/Jiang_Hierarchical_Adaptive_Filtering_Network_for_Text_Image_Specular_Highlight_Removal_CVPR_2025_paper.pdf | 2026-08-31 |
| E14 | UnReflectAnything highlight removal CLI/lib | https://github.com/alberto-rota/UnReflectAnything | 2026-08-31 |
| E15 | GCDRNet pip document appearance enhancement | https://pypi.org/project/gcdrnet/ | 2026-08-31 |
| E16 | DE-GAN enhance.py binarize/deblur/clean | https://github.com/dali92002/DE-GAN | 2026-08-31 |
| E17 | NAF-DPM diffusion document enhancement | https://github.com/ispamm/NAF-DPM | 2026-08-31 |
| E18 | GL-PGENet document enhancement | https://github.com/kukugpt/GL-PGENet | 2026-08-31 |
| E19 | PaddleOCR binarize/invert optional | https://www.paddleocr.ai/v2.10.0/en/ppocr/blog/inference_args.html | 2026-08-31 |
| E20 | Google Document AI glare defect + internal preprocess | https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr ; https://discuss.google.dev/t/document-pre-processing/333008 | 2026-08-31 |
| E21 | OpenCV.js receipt OCR adaptive threshold demo | https://opencv.org/smart-document-scanning-with-live-ocr-using-opencv-js/ | 2026-08-31 |
| E22 | OCRmyPDF unpaper clean defaults | https://ocrmypdf.readthedocs.io/en/stable/advanced.html | 2026-08-31 |
| E23 | Grayscale vs binarized for OCR A/B | https://trueocr.com/a-developer-s-guide-to-preprocessing-scans-for-better-ocr-re | 2026-08-31 |
| E24 | Preprocessing checklist — measure don't assume | https://ocr.direct/image-preprocessing-for-ocr | 2026-08-31 |
| E25 | GPT-4V + OCR text beats pixels alone | https://arxiv.org/html/2405.18433 | 2026-08-31 |
| E26 | GPT-4V resolution vs OCR accuracy | https://arxiv.org/html/2310.16809 | 2026-08-31 |
| E27 | Apple Vision resize ~2000px; preprocess limits | https://dev.to/amol_srivastava_7fb7543ef/on-device-ocr-in-swiftui-a-practical-guide-to-the-vision-framework-4ipa ; https://github.com/swaylenhayes/uitag/blob/main/docs/research/ocr-rescan-experiments.md | 2026-08-31 |
| E28 | Current prep: normalise JPEG color, no binarize | apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:12-43 | 2026-08-31 |

## Gaps

* No maintained npm package found for Sauvola/adaptive binarization without OpenCV native/WASM — Node one-call module likely sharp-only for contrast + global threshold, or sidecar for Sauvola.
* Retinex: no authoritative receipt-specific library or vendor guidance retrieved; only general CV literature references.
* Thermal-print oversharpening: no receipt-vendor white paper; inference extrapolated from thin-stroke Apple Vision experiments and general OCR oversharpen warnings — needs fixture A/B on budget-tools receipt images.
* homomorphic filtering: classical tutorials only; no production receipt pipeline citing it as default over CLAHE+inpaint.
* DocUNet/DEGAN/NAF-DPM/GL-PGENet: research-grade PyTorch; licensing, Windows GPU, and latency not validated for personal Node API — usability as library vs approach source still open.
* Apple official Vision docs do not prescribe binarize/sharpen preprocess — only resolution, ROI, language correction (WWDC19 + community).
* OpenRouter-specific guidance on binarized JPEG inputs: no vendor doc found; caution inferred from general vision LLM + GPT-4V papers.
* Wolf/NICK: OpenCV contrib only; no scikit-image equivalent confirmed.

## Stop

* Saturation for this lane at cycle 1 wave 1 wider posture: core algorithm packaging, Node sharp coverage, vendor preprocess positions, vision-vs-OCR conflict evidence, glare research landscape, and dual-output pattern notes are documented with URLs.
* Further cycles would likely duplicate OpenCV/Tesseract docs unless testing budget-tools receipt fixtures or hunting npm Sauvola WASM ports.

## Evidence relationships

| Parent question | This lane supplies |
|-----------------|-------------------|
| Q6 binarize/sharpen/CLAHE/glare; vision vs classic OCR | Algorithm/library table; vision-vs-OCR caution; E1–E28 |
| Q2 Node npm CV without Python | sharp covers normalise/clahe/sharpen/global threshold; no adaptive Sauvola in sharp (E8) |
| Q3 Python/C++ de facto stacks | Leptonica/Tesseract, OpenCV, scikit-image, kraken/ocropy legacy, PaddleOCR opt-in binarize |
| Q7 OSS-reusable product pipelines | OCRmyPDF/unpaper, OpenCV.js demo, Google internal preprocess + quality gate |
| Unresolved: color vision-safe vs binary OCR-safe | Dual-output notes + kraken/tessdoc/trueocr/GPT-4V caution — supports parent deferral, not resolution |
| Host fact: OpenRouter color JPEG today | E28 + vision caution aligns with keeping color branch for extract |

* Worker disposition: evidence only; no stack recommendation.*
