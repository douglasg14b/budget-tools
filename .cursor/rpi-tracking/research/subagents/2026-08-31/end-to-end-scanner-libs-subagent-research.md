<!-- markdownlint-disable-file -->

# Lane research: End-to-end document/receipt scanner libraries

## Lane inputs

- Cycle: 1
- Wave: Wider
- Topic: Receipt image cleanup for OCR/vision (crop, perspective/deskew, enhancement)
- Lane: End-to-end document/receipt scanner libraries that claim to do most or all of crop + perspective + enhancement as one API
- Posture: expansive
- Explicit limits: none

### Questions for this lane

- Which OSS libraries expose a single (or small) API that crops a document/receipt from a photo, perspective-corrects, and optionally enhances?
- For each candidate: language/runtime, license, last release or last commit date, install path, API names, implemented steps vs marketing, Windows feasibility, library vs app/demo.
- Include docTR/mindee doctr, OpenCV document-scanner packages, npm receipt/document-scanner, Scanbot and similar (proprietary), keras/tensorflow document scanners, img2table, unpaper, ScanTailor, 2024–2026 scanbot-alternative OSS.

### Criteria (from host context)

- budget-tools API is Node TypeScript on Windows
- Caller wants ONE function/call that owns CV; prefer maintained OSS full pipeline if up to date
- Extract sends processed JPEG to OpenRouter vision (tesseract.js removed)
- Prefer MIT/Apache/BSD/MPL; flag GPL/copyleft; flag abandoned repos

### Scope

- Libraries and SDKs marketed as document/receipt scanners with boundary detection plus geometric correction; include proprietary comparators; label example repos separately.

### Non-goals

- Selecting a final recommendation for the parent artifact
- Classifying parent evidence state
- Implementing product code
- Deep evaluation of sharp-only incremental prep already in budget-tools

## Actions taken

- Web search: mindee doctr crop, npm document-scanner/receipt-scanner, scanbot alternatives OSS, unpaper/scantailor, tensorflow document unwarping, pagescan, dynamsoft node
- Fetched primary sources: GitHub README/wiki, PyPI, npm registry pages, vendor docs (Mindee, Scanbot, Dynamsoft, pagescan site)
- GitHub API (gh): last push dates and licenses for key repos (retrieval 2026-08-31)

### URLs fetched (retrieval 2026-08-31 unless noted)

- https://github.com/mindee/doctr
- https://pypi.org/project/python-doctr/
- https://mindee.github.io/doctr/using_doctr/using_cli.html
- https://www.mindee.com/platform/crop
- https://docs.mindee.com/crop-models/sdk-integration/crop-quick-start
- https://github.com/puffinsoft/jscanify
- https://www.npmjs.com/package/jscanify
- https://github.com/puffinsoft/jscanify/wiki/API
- https://github.com/puffinsoft/jscanify/wiki/Getting-started
- https://www.npmjs.com/package/opencv-document-scanner
- https://github.com/tony-xlh/opencvjs-document-scanner
- https://www.npmjs.com/package/quadscan
- https://github.com/storrealbac/quadscan
- https://github.com/DocsaidLab/DocAligner
- https://www.npmjs.com/package/react-document-perspective-crop
- https://pypi.org/project/document-preprocessor/
- https://github.com/smirnovkirilll/document_preprocessor
- https://pagescan.7rplus.com/
- https://github.com/7RPlus-GmbH/pagescan
- https://huggingface.co/7rplus/pagescan-weights
- https://pypi.org/project/scantailor-advanced/
- https://github.com/4lex4/scantailor-advanced (via stalib PyPI links)
- https://github.com/unpaper/unpaper
- https://pypi.org/project/img2table/
- https://github.com/xavctn/img2table
- https://github.com/LiteObject/doc-scanner
- https://www.npmjs.com/package/dynamsoft-document-normalizer
- https://www.npmjs.com/package/dynamsoft-capture-vision-for-node
- https://www.dynamsoft.com/document-normalizer/overview/
- https://scanbot.io/document-scanner-sdk/
- https://github.com/mhashas/Document-Image-Unwarping-tensorflow
- https://www.npmjs.com/package/react-native-receipt-scanner
- https://pub.dev/packages/document_scan
- https://github.com/francis2408/scanner_pro
- https://github.com/MatiwosKebede/openscanvision
- https://github.com/YegorCherov/document-scanner
- https://github.com/lalitavai/documentScanner

## Findings table

| Candidate | Type | Crop / perspective / enhance coverage | License | Last activity | Runtime | Windows / Node notes | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| jscanify | Library (npm) | Detect quad (findPaperContour); perspective crop (extractPaper); highlight only; v1.3+ glare suppression; no contrast/sharpen pipeline | MIT | npm 1.4.3 (2026-07-20); GitHub push 2026-07-20 | JS; browser + Node (wiki: loadOpenCV + canvas) | Node feasible via canvas + OpenCV load; single main API extractPaper; enhancement minimal | High |
| opencv-document-scanner | Library (npm) | detect + crop (perspective warp); no enhancement | MIT | npm 1.2.2 (2025-09-11); GitHub push 2025-09-11 | JS; OpenCV.js; browser-oriented | Same Node pattern as jscanify; smaller API surface (DocumentScanner.detect/crop) | High |
| quadscan | Library (npm) | ML corner detect (DocAligner ONNX) + warp (Quadscan.scan mode extract); no separate enhance stage | MIT (model Apache-2.0) | npm 1.0.0 only (2026-05-24); GitHub push 2026-05-24 | Browser (onnxruntime-web); not Node server | Browser/WASM only; ~5 MB model lazy load; very new, 21 weekly downloads | Medium |
| react-document-perspective-crop | Library (npm, React) | Auto edge detect, perspective warp, brightness/contrast/sharpness; headless hook usePerspectiveCrop | MIT | npm 0.1.1 (2026-07-24) | React + OpenCV.js | Not a Node API library; needs browser/React or OpenCV.js embedding | High |
| document-preprocessor | Library (PyPI) | Full pipeline: EXIF, detect 4-pt contour, perspective warp, contrast, denoise, binarize (Otsu/adaptive), morphology, sharpen, save; DocumentPreprocessor.process_image / preprocess_file | Apache-2.0 | PyPI 2026.1.8.2 (2026-01-08); GitHub push 2026-01-08 | Python >=3.13; OpenCV + Pillow | Windows OK if Python 3.13+ stack installed; integrate from Node via subprocess; README flags 100% AI-authored | High |
| pagescan (7RPlus-GmbH) | Library (git; not on PyPI yet) | End-to-end: YOLO detect, SAM segment, quad fit, perspective, orientation, shadow removal/white balance/sharpen, PDF; pagescan.scan / ScanConfig | MIT (weights Apache-2.0) | GitHub push 2026-08-22; site © 2026 | Python; ONNX/torch weights from Hugging Face | Windows plausible; heavy deps + ~450MB+ weights; 2 GitHub stars; pip install git+https://github.com/7RPlus-GmbH/pagescan | Medium |
| python-doctr (Mindee docTR) | Library (PyPI) | OCR/detection/recognition; optional straighten_pages, detect_orientation for page rotation before OCR; layout/KIE; NOT photo boundary crop or receipt isolation | Apache-2.0 | PyPI v1.1.0; release v1.1.0 (2026-08-21); GitHub push 2026-08-28 | Python 3.11+; PyTorch | Wrong tool for receipt crop; orientation/deskew for OCR not perspective-from-photo | High |
| Mindee Crop API | Proprietary cloud API | Cloud crop/deskew/multi-doc isolation; polygon bboxes; async enqueue | Commercial | Product docs 2026 (live SaaS) | REST + Python/Java SDKs | Not OSS; network dependency; separate from docTR OSS | High |
| img2table | Library (PyPI) | Table detection/extraction on already-flat pages; OpenCV table ID only | MIT | GitHub push 2026-07-12 | Python | No document boundary or perspective correction | High |
| scantailor-advanced (stalib / PyPI scantailor-advanced) | Library (Python bindings) | ScanTailor pipeline: orientation, page split, deskew (rotation), content box, margins, binarization/dewarp; assumes scanned page not phone photo quad detection | GPL-3.0-or-later | PyPI 1.0.1 (2026-08-17); upstream ScanTailor Advanced push 2023-09-13 | Python + C++/Qt wheels | Windows build complex; copyleft; no arbitrary-photo crop API | High |
| ScanTailor Advanced (desktop) | Desktop app (+ CLI) | Interactive post-process: deskew, oblique deskew, dewarp, binarization; not embeddable single-call library | GPL-3.0 (upstream) | vigri branch marketed active 2026; repo push 2023-09-13 | C++/Qt desktop | CLI exists (scantailor-cli) but app/workflow not Node library | High |
| unpaper | CLI tool | Deskew (rotation), border/mask cleanup, contrast for scanned sheets; no 4-point perspective from camera photo | GPL-2.0-only (project) | GitHub push 2024-07-11 | C; ffmpeg dependency | Callable as subprocess; wrong geometry model for receipt-in-scene | High |
| Dynamsoft Document Normalizer (DDN) | Proprietary SDK | Quad detect + normalize (deskew, perspective, shadow/contrast per marketing); CaptureVisionRouter templates | SEE LICENSE IN LICENSE (commercial) | npm dynamsoft-document-normalizer 2.6.11 (2026-01-27) | JS/WASM browser | Browser-first; license key required | High |
| dynamsoft-capture-vision-for-node | Proprietary SDK | Node wrapper for DCV including document capture templates; captureAsync with preset templates | SEE LICENSE IN LICENSE | npm 3.2.5002 (2025-12-31) | Node >=16; win32 x64 supported | Fits Node/Windows API server; proprietary; doc capture guide noted under development | High |
| Scanbot Web/SDK | Proprietary SDK | Auto crop, deskew, filters, quality analyzer, document straightener; Ready-to-use UI + API | Commercial | Vendor site active 2026 | iOS/Android/Web/Windows/Linux; React Native | scanbot-web-sdk npm exists but bot-protected fetch; trial license; not OSS | Medium |
| DocAligner | Library / model repo | Corner heatmap regression only; no warp or enhance in repo | Apache-2.0 | GitHub push 2026-01-13 | Python training; ONNX export | Building block used by quadscan/pagescan; not end-to-end alone | High |
| LiteObject/doc-scanner | CLI / approach source | OpenCV contour detect, 4-pt warp, denoise/CLAHE/sharpen, multi threshold variants; CLI | Unknown (no license in API) | GitHub push 2025-09-30 | Python CLI | approach source, not a library; reimplementable pipeline | Medium |
| YegorCherov/document-scanner | approach source, not a library | OpenCV detect + perspective + threshold enhance; CLI script | Unknown | Small repo | Python script | approach source | Medium |
| lalitavai/documentScanner | approach source, not a library | Single-script OpenCV scanner | Unknown | Created 2025-01-10 | Python script | approach source | Medium |
| mhashas/Document-Image-Unwarping-tensorflow | Research repo | DL page unwarping (DocUNet-style); not receipt boundary crop | Unknown | TensorFlow research port | Python TF | approach source for dewarping not phone crop | Medium |
| react-native-receipt-scanner | Mobile library | ML Kit/VisionKit scan + perspective crop + OCR; gallery crop UI | Check npm (OSS) | npm package active 2025–2026 | React Native iOS/Android | Not Node/Windows server | High |
| document_scan (Flutter) | Mobile library | DocumentDetector + DocumentProcessor; corners + warp + filter | OSS (pub.dev) | pub.dev maintained 2025–2026 | Flutter iOS/Android | Not Node | High |
| scanner_pro (Flutter) | Mobile SDK | Claims deskew, magic color, whitening; broad scanner SDK | MIT | GitHub v2.5.0 marketing | Flutter | Not Node; very broad scope | Medium |
| openscanvision | Android library | Perspective correction module; OMR/QR focus | Apache-2.0 (typical) | GitHub v1.0.0 era | Android AAR | Not Node/Windows server | Medium |
| trudido-scanner | Android library module | OpenCV corner detect + crop UI | GPL-3.0 | Created 2026-02-26 | Android | Not Node; copyleft | Medium |

### Cross-cutting observations

- No maintained pure-Node OSS library was found that exposes one function owning crop + perspective + photographic enhancement comparable to CamScanner-style output. Closest Node-native OSS: jscanify extractPaper (geometry only) or opencv-document-scanner detect/crop.
- Full photographic pipelines with enhancement cluster in Python (document-preprocessor, pagescan) or proprietary SDKs (Dynamsoft, Scanbot, Mindee cloud).
- docTR and img2table are frequently named in document-AI searches but do not replace a receipt photo scanner stage.
- unpaper and ScanTailor address flat scans and book pages (rotation/deskew/dewarp), not isolating a receipt from a tabletop photo.
- 2024–2026 “scanbot alternative” OSS is mostly mobile (Flutter/Android) or browser ML (quadscan); server-side newcomer pagescan (Aug 2026) is the closest Python one-call OSS match but immature.

## Provenance (URLs with retrieval 2026-08-31)

- docTR README and scope: https://github.com/mindee/doctr
- docTR PyPI v1.1.0 Apache-2.0: https://pypi.org/project/python-doctr/
- docTR CLI straighten_pages / detect_orientation: https://mindee.github.io/doctr/using_doctr/using_cli.html
- Mindee proprietary Crop API: https://www.mindee.com/platform/crop , https://docs.mindee.com/crop-models/sdk-integration/crop-quick-start
- jscanify npm + API: https://www.npmjs.com/package/jscanify , https://github.com/puffinsoft/jscanify/wiki/API , Node wiki https://github.com/puffinsoft/jscanify/wiki/Getting-started
- opencv-document-scanner: https://www.npmjs.com/package/opencv-document-scanner
- quadscan: https://www.npmjs.com/package/quadscan , https://github.com/storrealbac/quadscan
- DocAligner: https://github.com/DocsaidLab/DocAligner
- react-document-perspective-crop: https://www.npmjs.com/package/react-document-perspective-crop
- document-preprocessor: https://pypi.org/project/document-preprocessor/ , https://github.com/smirnovkirilll/document_preprocessor
- pagescan: https://pagescan.7rplus.com/ , https://github.com/7RPlus-GmbH/pagescan , weights https://huggingface.co/7rplus/pagescan-weights
- stalib / scantailor-advanced PyPI: https://pypi.org/project/scantailor-advanced/
- unpaper GPL-2.0 CLI: https://github.com/unpaper/unpaper (README + LICENSES)
- img2table: https://github.com/xavctn/img2table , https://pypi.org/project/img2table/
- Dynamsoft DDN npm: https://www.npmjs.com/package/dynamsoft-document-normalizer
- Dynamsoft Node: https://www.npmjs.com/package/dynamsoft-capture-vision-for-node
- Scanbot SDK: https://scanbot.io/document-scanner-sdk/
- Example repos: https://github.com/LiteObject/doc-scanner , https://github.com/YegorCherov/document-scanner
- Mobile comparators: https://www.npmjs.com/package/react-native-receipt-scanner , https://pub.dev/packages/document_scan , https://github.com/francis2408/scanner_pro

## Gaps and what would justify re-entry

- Did not run hands-on Windows installs or benchmark receipt fixtures against any candidate (license fetch, API surface, and marketing claims only).
- scanbot-web-sdk npm page blocked automated fetch; API surface not fully enumerated.
- pagescan not on PyPI; production readiness unverified (2 stars, large weight download).
- document-preprocessor Python >=3.13 constraint and “AI-created” disclaimer not validated against real receipt photos.
- No exhaustive npm grep for every document-scanner package name variant; focused on highest-signal maintained packages.
- TensorFlow/Keras: only research unwarping repos found, no maintained pip-installable end-to-end receipt scanner.
- Re-entry justified if parent needs: hands-on Node Windows POC (jscanify vs dynamsoft trial), pagescan PyPI release evaluation, or license/compliance deep-dive on GPL candidates.

## Stop decision for THIS LANE only

Stop. Expansive catalog of named candidates plus proprietary comparators is complete for cycle 1 wider wave. Primary sources fetched for all mandated names. Remaining uncertainty is empirical fit on budget-tools receipt fixtures, not missing library discovery.

## Compact evidence relationships: question -> claim -> URL

- Q: Does docTR provide one-call receipt crop from photo? -> Claim: No; docTR is OCR with optional page straighten/orientation for OCR, not boundary crop from scene. -> https://github.com/mindee/doctr
- Q: Does Mindee offer crop as OSS? -> Claim: Crop is proprietary cloud API/SDK, separate from docTR Apache library. -> https://www.mindee.com/platform/crop
- Q: Best-known Node OSS geometry-only scanner? -> Claim: jscanify extractPaper detects document and perspective-warps; Node supported via loadOpenCV + canvas. -> https://github.com/puffinsoft/jscanify/wiki/Getting-started
- Q: opencv-document-scanner steps? -> Claim: DocumentScanner.detect and .crop only; MIT; Sep 2025 release. -> https://www.npmjs.com/package/opencv-document-scanner
- Q: ML browser alternative to classical OpenCV.js? -> Claim: quadscan Quadscan.scan uses DocAligner ONNX for corners + warp; browser only. -> https://www.npmjs.com/package/quadscan
- Q: Python one-call OSS full pipeline? -> Claim: document-preprocessor DocumentPreprocessor.process_image chains EXIF, detect+warp, contrast, binarize, sharpen. -> https://pypi.org/project/document-preprocessor/
- Q: New 2026 Python scanbot-style OSS? -> Claim: pagescan.scan runs detect/segment/quad/perspective/enhance/PDF locally; git install only. -> https://pagescan.7rplus.com/
- Q: img2table scope? -> Claim: Table extraction on flat documents; no receipt crop. -> https://github.com/xavctn/img2table
- Q: unpaper vs photo scanner? -> Claim: GPL-2.0 CLI deskew/cleanup for scanned sheets; not perspective crop from camera. -> https://github.com/unpaper/unpaper
- Q: ScanTailor as library? -> Claim: stalib/scantailor-advanced PyPI exposes Pipeline.process but GPL-3.0 and scan-page oriented, not phone quad detect. -> https://pypi.org/project/scantailor-advanced/
- Q: Dynamsoft on Node Windows? -> Claim: dynamsoft-capture-vision-for-node supports win32 x64; proprietary license; captureAsync document templates. -> https://www.npmjs.com/package/dynamsoft-capture-vision-for-node
- Q: Scanbot OSS? -> Claim: Proprietary SDK with auto crop/deskew/filters; web and Windows listed. -> https://scanbot.io/document-scanner-sdk/
- Q: react-native-receipt-scanner on Node? -> Claim: Mobile RN only; perspective crop via ML Kit/VisionKit. -> https://www.npmjs.com/package/react-native-receipt-scanner
- Q: DocAligner alone end-to-end? -> Claim: Corner prediction model only; consumers (quadscan, pagescan) add warp/enhance. -> https://github.com/DocsaidLab/DocAligner
- Q: Example OpenCV pipeline to reimplement? -> Claim: LiteObject/doc-scanner documents detect, 4-pt warp, CLAHE/sharpen CLI stages. -> https://github.com/LiteObject/doc-scanner
