<!-- markdownlint-disable-file -->
# Existing tools and pipelines — receipt image cleanup (lane research)

Retrieval date: 2026-08-31. Posture: expansive. Parent artifact not edited.

## Lane inputs

- OSS tools named in brief: paperless-ngx consume/preprocess, OCRmyPDF, unpaper, ScanTailor / ScanTailor Advanced, NAPS2, gImageReader, ExactImage, ImageMagick `-deskew`/`-lat`, Tesseract tessedit image processing.
- Commercial/mobile context only (not drop-in): Scanbot, Adobe Scan, Microsoft Lens, CamScanner, Google Drive scan.
- Receipt-specific OSS and mobile document-scanner OSS.
- Questions: pipeline steps (crop, deskew, binarize, enhance), library vs CLI reusability, license, last activity.

## Actions

- Readed project docs and GitHub metadata (gh api pushed_at, license) for named OSS repos.
- Readed OCRmyPDF cookbook/advanced docs, paperless-ngx configuration docs, ImageMagick command-line docs, Tesseract tessdoc ImproveQuality.
- Readed published algorithm sources for commercial products (Adobe research PDF, Microsoft Research blog/patents, Grizzly Labs Genius Scan blog, Dropbox scanning blog, Scanbot comparison blogs). Treated marketing pages as non-proof except where they cite concrete techniques.
- Surveyed adjacent OSS receipt pipelines and mobile scanner libraries (jscanify, pagescan, OpenNoteScanner, shoebox, document_preprocessor).

## Tool table

Classification: **OSS-reusable** = callable library/SDK or stable subprocess with documented API; **OSS-app/CLI** = primarily end-user app or CLI, reuse via subprocess or code fork; **approach-only** = proprietary or closed SDK, published technique only; **proprietary** = closed product, no reusable code.

| Tool | Class | License | Last activity (GitHub or package) | Callable as | Receipt fit |
|------|-------|---------|----------------------------------|-------------|-------------|
| paperless-ngx | OSS-app | GPL-3.0 | pushed 2026-08-31 | App + hooks; no image-prep library | Indirect: delegates OCR prep to OCRmyPDF; pre/post-consume scripts for custom pipelines |
| OCRmyPDF | OSS-reusable | MPL-2.0 | pushed 2026-08-31 | Python API (`ocr()`, plugins) + CLI | Strong for flatbed scans/PDFs; weak for phone perspective crop |
| unpaper | OSS-app/CLI | GPL-2.0 | pushed 2024-07-11 | CLI only (ffmpeg I/O); no stable C API for embedding | Flat scans with dark borders; no quad detection |
| ScanTailor (original) | OSS-app | GPL (scantailor repo) | pushed 2020-11-29 | GUI/batch CLI project files; not a library | Book/page scans; manual project workflow |
| ScanTailor Advanced | OSS-app | GPL-3.0 | pushed 2026-05-24 | Same as ScanTailor; interactive C++/Qt6 app | Excellent binarize/deskew for flat scans; not phone-receipt oriented |
| NAPS2 | OSS-reusable | GPL-2.0 app; LGPL-2.1 NAPS2.Sdk | pushed 2026-08-23 | .NET SDK (`AutoDeskew`); CLI `naps2.console --deskew` | Scanner-centric; deskew + crop in GUI/CLI, not document-from-photo |
| gImageReader | OSS-app | GPL-3.0 | pushed 2026-01-15 | GUI only; no CLI | No built-in preprocess pipeline; passes canvas image straight to Tesseract |
| ExactImage | OSS-reusable | GPL-2.0 | pkg 1.2.1 (Debian 2025–2026) | C++ lib + SWIG (Python/PHP/Lua); `econvert` CLI | Crop/rotate/scale; **no deskew**; barcode/OCR helpers |
| ImageMagick | OSS-reusable | ImageMagick License (Apache 2.0–like) | pushed 2026-09-01 | CLI `magick`; MagickWand/C++ API | `-deskew`, `-lat` binarize, morphology; no document quad detect |
| Tesseract | OSS-reusable | Apache-2.0 | pushed 2026-08-25 | C++ API (`TessBaseAPI`, `ImageThresholder`) | Internal binarize (Otsu/Sauvola); **no global deskew** of input image |
| sbrunner/deskew | OSS-reusable | MIT | pushed 2026-09-01 | Python package + CLI | Deskew-only helper; composable |
| OpenNoteScanner | OSS-app | GPL-3.0 | pushed 2025-04-23 | Android app; logic in Java/OpenCV | Phone doc scan: edge detect + perspective warp |
| jscanify | OSS-reusable | MIT | pushed 2026-07-20 | JS library (opencv.js) | Paper detection + perspective extract; web/mobile |
| wascanner | OSS-reusable | MIT | pushed 2026-07-01 | TS/JS + WASM (Go) | Same class as jscanify; worker API |
| pagescan | OSS-reusable | MIT | pushed 2026-08-22 | Python lib + CLI | YOLO+SAM detect, perspective, enhancement; headless |
| document_preprocessor | OSS-reusable | Apache-2.0 | pushed 2026-01-08 | Python library + CLI | Contour warp + adaptive binarize; OCR prep |
| scanic | OSS-reusable | MIT | pushed 2025-12-26 | JS/Rust WASM | Doc detect + `receipt` preset in autoEnhance |
| shoebox | OSS-app | (repo; local-first expense) | active 2025–2026 | CLI app | Receipt-specific: perspective crop, deskew, optional threshold |
| Scanbot SDK | proprietary | Commercial | Apryse product | Closed SDK (C/Java/Python/Node wrappers) | Full mobile scan pipeline; offline on-device |
| Adobe Scan | approach-only | Proprietary | Product | Sensei; no OSS drop-in | Contour quad + perspective; multi-frame shadow removal (published) |
| Microsoft Lens | approach-only | Proprietary | Product | Closed | Structured-forest edges (MSR); patent also describes Canny+Hough quad pipeline |
| CamScanner | approach-only | Proprietary | Product | Closed | Community/patent synthesis: Canny/contours/Hough + homography; not verified from vendor |
| Google ML Kit Doc Scanner | approach-only | Proprietary (Play Services) | Product | Closed Android API | Auto capture, edge detect, filters; used by Drive/Files/Pixel Camera |
| Google Drive scan UI | approach-only | Proprietary | 2024–2025 product news | Uses ML Kit scanner | Enhance: white balance, shadow removal, contrast, sharpen (product announcements) |
| Genius Scan (Grizzly Labs) | approach-only | Proprietary | Blog 2024 | Closed; OSS parts none published | MobileNet keypoints + classical refinement hybrid (vendor blog) |
| Dropbox doc scan | approach-only | Proprietary | Dropbox tech blog | Closed | Custom CV: edges → Hough lines → quadrilateral scoring |

## Pipeline steps each performs

### paperless-ngx

- **Does not** ship receipt/phone image cleanup in core consume path.
- Default OCR path calls OCRmyPDF with `deskew`, `rotate_pages`, `clean` (unpaper) per `PAPERLESS_OCR_DESKEW`, `PAPERLESS_OCR_CLEAN`, `PAPERLESS_OCR_USER_ARGS` (docs.paperless-ngx.com/configuration).
- **Pre-consume / post-consume scripts** allow external pipelines (e.g. OpenCV+unpaper preprocess repos; photo-to-scan with DocAligner corner detect → perspective crop → Hough deskew before upload).
- Steps available **indirectly**: deskew, unpaper clean (border/noise/deskew), rotate, background removal (via OCRmyPDF user args), not perspective crop.

### OCRmyPDF

- Image pipeline order (cookbook): **rotate pages → remove background → deskew → clean (unpaper)**.
- `--deskew`: small skew correction (distinct from 90° `--rotate-pages`).
- `--clean` / `--clean-final`: invokes **unpaper** subprocess; `--unpaper-args` forwards options.
- `--remove-background`: grayscale/color background whitening (monochrome ignored); may rasterize pages.
- Python API + plugin hooks (`filter_ocr_image`, `filter_page_image`) for custom steps.
- **Not included**: document boundary detection or perspective correction from phone photos.

### unpaper

- Post-process **already flat** scan images: dark edge removal, mask-based **deskew** (scan-line rotation), margin crop, noise filters, optional layout (single/double page).
- Depends on **ffmpeg** for I/O.
- **CLI only**; each step disableable per sheet.
- **Not included**: perspective/trapezoid correction from camera angle.

### ScanTailor / ScanTailor Advanced

- Interactive batch workflow: fix orientation, **split pages**, **deskew** (incl. oblique deskew in Advanced), **content box** selection (crop), dewarp/spline (Advanced marketing/docs), illumination normalize, **adaptive binarization** (Sauvola, Wolf).
- Output: cleaned TIFF/JPEG pages for PDF assembly.
- **App/project file model**, not embeddable library.

### NAPS2

- Scan from hardware → GUI edit: **rotate, crop, deskew**, brightness/contrast.
- `NAPS2.Sdk`: `ScanOptions.AutoDeskew`, `RotateDegrees`; image ops in LGPL assemblies.
- CLI: `--deskew`, `--rotate`.
- **Scanner workflow**, not camera document detection.

### gImageReader

- Gtk/Qt front-end to Tesseract; **no additional image processing** before `SetImage` (maintainer statement, issue #277).
- OpenCV/unpaper integration discussed but **not shipped** (issues #256, #195 closed/abandoned).
- **OCR UI only** for prep purposes.

### ExactImage

- Fast C++ image ops: **rotate, scale, crop**, `--fast-auto-crop`, convolutions, JPEG/PDF embed, barcode.
- SWIG bindings for scripting.
- **No deskew operator** in econvert man page.

### ImageMagick

- `-deskew threshold%`: straighten skew; optional auto-crop artifact.
- `-lat WxH{+-}offset%`: **local adaptive threshold** (uneven background / fax-like binarize).
- Also: `-threshold`, morphology (`-morphology`), `-contrast-stretch`, connected-components cleanup.
- **CLI and MagickWand API**; composable shell pipelines.
- **No** document quadrilateral detection.

### Tesseract

- Pre-OCR internal: scaling, **binarization** via `ImageThresholder` — Otsu (0), adaptive Otsu (1), Sauvola (2) via `thresholding_method` / tessedit params.
- `tessedit_write_images` / `get.images` config exposes `tessinput.tif` for debugging.
- **Does not** globally deskew or perspective-correct input; tolerates slight skew via baseline detection during OCR (tessdoc, GitHub issue #677).
- **Library** (C++ API); not a document cleanup tool.

### Receipt-oriented OSS (library vs app)

| Project | Type | Typical steps |
|---------|------|----------------|
| shoebox | CLI app | perspective crop, deskew, optional adaptive threshold → PaddleOCR |
| document_preprocessor | library | EXIF, contour warp, grayscale, denoise, Otsu/adaptive binarize, sharpen |
| Receipt-OCR-Pipeline (several GH repos) | app/scripts | grayscale, denoise, Hough deskew, CLAHE, upscale — **receipt-tuned, not receipt-boundary detect** |
| IgorKhramtsov/receipt-recognition | library (C++) | morph crop, illumination norm, adaptive threshold, deskew |
| scanic | library | contour detect, perspective; **`receipt` enhancement preset** |
| pagescan | library | YOLO bbox, SAM mask, quad, orientation CNN, perspective, shadow/white-balance enhance |

### Mobile document-scanner OSS

| Project | Steps | Reuse |
|---------|-------|-------|
| OpenNoteScanner | Canny/contour quad, perspective warp, filter modes | App; Java/OpenCV code forkable (GPL-3.0) |
| jscanify | opencv.js highlight/extract paper | npm library |
| wascanner | WASM detect/highlight/extract | npm `WAScanner` / worker API |
| scannerpro (Flutter) | edge scan, filters: binarization, magicColor, shadowRemoval, deskew | MIT SDK-like package; uses Google ML Kit for OCR |

## Provenance

- paperless-ngx config OCR settings: https://docs.paperless-ngx.com/configuration
- paperless-ngx no native preprocess; pre-consume hooks: https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/advanced_usage.rst
- teekennedy/paperless-preprocess-pipeline (OpenCV bilateral, crop/rotate, Otsu, unpaper): https://github.com/teekennedy/paperless-preprocess-pipeline/
- tomelliot/photo-to-scan pipeline (DocAligner, perspective, deskew): https://github.com/tomelliot/photo-to-scan
- OCRmyPDF cookbook image pipeline: https://ocrmypdf.readthedocs.io/en/latest/cookbook.html
- OCRmyPDF unpaper control: https://ocrmypdf.readthedocs.io/en/stable/advanced.html
- OCRmyPDF Python API: https://ocrmypdf.readthedocs.io/en/latest/apiref.html
- unpaper README and man (deskew, masks, ffmpeg): https://github.com/unpaper/unpaper — https://github.com/unpaper/unpaper/blob/main/doc/unpaper.1.rst
- unpaper GPL-2.0: https://tracker.debian.org/media/packages/u/unpaper/copyright-7.0.0-5
- ScanTailor Advanced README: https://github.com/ScanTailor-Advanced/scantailor-advanced/
- NAPS2 README + SDK ScanOptions: https://github.com/cyanfish/naps2 — https://www.naps2.com/sdk/doc/api/NAPS2.Scan.ScanOptions.html
- gImageReader no preprocess (#277): https://github.com/manisandro/gImageReader/issues/277
- ExactImage econvert man (crop, no deskew): https://manpages.debian.org/unstable/exactimage/econvert.1.en.html
- ImageMagick `-deskew`, `-lat`: https://imagemagick.org/command-line-options/ — https://usage.imagemagick.org/transform/
- ImageMagick DeskewImage source: https://www.imagemagick.org/api/MagickCore/shear_8c_source.html
- Tesseract ImproveQuality / no deskew: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html — https://github.com/tesseract-ocr/tesseract/issues/677
- sbrunner/deskew: https://github.com/sbrunner/deskew
- OpenNoteScanner README (GPL-3.0, perspective): https://github.com/allgood/OpenNoteScanner/blob/master/README.md
- jscanify: https://github.com/puffinsoft/jscanify
- pagescan: https://github.com/7RPlus-GmbH/pagescan
- document_preprocessor: https://github.com/smirnovkirilll/document_preprocessor
- shoebox: https://github.com/Qweffy/shoebox
- Adobe Scan Sensei (boundary, shadow): https://blog.adobe.com/en/publish/2017/05/31/introducing-adobe-scan-modern-document-creation-for-a-mobile-first-world — EUSIPCO 2022 shadow paper: https://eurasip.org/Proceedings/Eusipco/Eusipco2022/pdfs/0000508.pdf
- Microsoft Lens Office Lens MSR blog: https://www.microsoft.com/en-us/research/blog/office-lens-snap/ — structured forests: https://www.microsoft.com/en-us/research/wp-content/uploads/2013/12/DollarICCV13edges.pdf
- Genius Scan detection blog: https://blog.thegrizzlylabs.com/2024/10/document-detection.html
- Dropbox document detection blog: https://dropbox.tech/machine-learning/fast-and-accurate-document-detection-for-scanning
- Scanbot proprietary; compares OpenCV/ML Kit: https://scanbot.io/blog/ml-kit-vs-opencv-document-scanning-software/
- Google ML Kit doc scanner (closed): https://medium.com/google-developer-experts/ml-kit-document-scanner-in-action-1c3a49ef5a33
- Google Drive Enhance (ML Kit): https://9to5google.com/2024/12/15/google-drive-scanner-enhance/

## Gaps

- ExactImage upstream SVN/Git activity not confirmed beyond Debian 1.2.1 packaging dates; no deskew evidence found.
- CamScanner vendor-published algorithm detail not found; only third-party summaries and patents from other vendors.
- ScanTailor Advanced "3D dewarp" claims on scantailor.net marketing site not verified against source README (treated as vendor marketing).
- OCRmyPDF `--remove-background` implementation details in v17 not traced to source module in this lane (docs state feature exists).
- Genius Scan "OSS parts" — **no open-source detection core published**; only vendor blog.
- OpenNoteScanner last meaningful feature commit may predate 2025 push; activity is maintenance-level.
- Receipt-specific OSS overwhelmingly assumes **full-frame receipt** (no narrow thermal-roll aspect handling documented).
- License for NAPS2 main app read from README (GPL-2.0); GitHub API returned NOASSERTION.

## Stop

Lane complete for Cycle 1 / Wider. Evidence recorded; no recommendation selected. Parent may merge tool-table rows into primary artifact.

### Compact return

- **Status:** complete
- **Path:** `.cursor/rpi-tracking/research/subagents/2026-08-31/existing-tools-pipelines-subagent-research.md`

**Claim + URL bullets:**

- paperless-ngx has no built-in phone-style crop/deskew; OCR prep is OCRmyPDF (`PAPERLESS_OCR_CLEAN`, `PAPERLESS_OCR_DESKEW`) plus optional pre-consume scripts — https://docs.paperless-ngx.com/configuration
- OCRmyPDF pipeline is rotate → remove-background → deskew → unpaper clean; Python API and plugins reusable — https://ocrmypdf.readthedocs.io/en/latest/cookbook.html
- unpaper is CLI-only GPL-2.0 deskew/border/margin cleaner for flat scans; last push 2024-07 — https://github.com/unpaper/unpaper
- ScanTailor Advanced is active GPL-3.0 interactive app (deskew, content crop, Sauvola/Wolf binarize); not a library — https://github.com/ScanTailor-Advanced/scantailor-advanced/
- NAPS2.Sdk (LGPL) and CLI expose deskew; scanner-oriented — https://www.naps2.com/sdk/doc/api/NAPS2.Scan.ScanOptions.html
- gImageReader passes unmodified images to Tesseract; no shipped preprocess — https://github.com/manisandro/gImageReader/issues/277
- ExactImage/econvert: crop/rotate, no deskew — https://manpages.debian.org/unstable/exactimage/econvert.1.en.html
- ImageMagick `-deskew` and `-lat` documented; MagickWand/CLI reusable — https://imagemagick.org/command-line-options/
- Tesseract binarizes internally (Otsu/Sauvola); does not deskew input — https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
- OpenNoteScanner / jscanify / pagescan / document_preprocessor provide reusable perspective+crop paths missing from unpaper/OCRmyPDF stack
- Commercial scanners (Adobe, Microsoft, Scanbot, ML Kit, Genius Scan) are approach-only; published techniques include contour quads, structured-forest edges, MobileNet keypoints, multi-frame shadow stats

**Gaps:** CamScanner primary-source algorithms; ExactImage freshness; receipt-aspect-specific OSS; Genius Scan OSS core absent.

**Stop:** lane evidence sufficient for parent synthesis; no further retrieval queued in this lane for Cycle 1.

## Evidence relationships

```text
[phone receipt photo]
    |
    +-- OSS reusable perspective path ----+--> jscanify / wascanner / pagescan / document_preprocessor / OpenNoteScanner (fork)
    |
    +-- OSS flat-scan path --------------+--> unpaper <-- OCRmyPDF -- paperless-ngx
    |                                    +--> ScanTailor Advanced (manual batch)
    |                                    +--> ImageMagick (-deskew, -lat) + Tesseract (binarize/OCR)
    |
    +-- OSS scanner deskew only ---------+--> NAPS2.Sdk / sbrunner/deskew
    |
    +-- approach-only (published) -------+--> Adobe contour+perspective+shadow (EUSIPCO)
    |                                    +--> Microsoft structured forests / Hough quads (patent+blog)
    |                                    +--> Genius Scan MobileNet keypoints + classical refine (blog)
    |                                    +--> Dropbox Hough quad scoring (blog)
    |
    +-- proprietary closed --------------+--> Scanbot SDK, ML Kit Document Scanner, CamScanner
```

- **Composes:** OCRmyPDF wraps unpaper + Tesseract deskew angle + Pillow rotate; paperless wraps OCRmyPDF.
- **Orthogonal:** perspective correction (OpenNoteScanner class) vs rotation deskew (unpaper/ImageMagick/OCRmyPDF).
- **Receipt lane overlap:** shoebox, scanic `receipt` preset, and receipt OCR repos add CLAHE/adaptive threshold after (optional) deskew — usually **without** vendor-grade boundary detect unless combined with jscanify/pagescan class libs.
