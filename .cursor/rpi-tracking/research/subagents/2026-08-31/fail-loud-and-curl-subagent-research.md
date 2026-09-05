<!-- markdownlint-disable-file -->

# Lane Research: Fail-loud quad miss, curl/dewarp, copyleft flags

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Deeper |
| Lane | Fail-loud contract when no receipt quad; curled thermal paper beyond homography; GPL tool exclusion |
| Posture | expansive |
| Status | Complete (cycle 1 wave 2) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/fail-loud-and-curl-subagent-research.md |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |

## Lane inputs

- Host rule (root-cause-over-workarounds): no silent fallback that hides missing geometry or missing CV deps.
- Current extract path: `prepReceiptImage` only EXIF-rotate, normalise, downsample, stitch; `extractReceipt` always sends processed JPEG to OpenRouter vision (`apps/api/src/features/receipts/extractReceipt.ts:84`, `prepReceiptImage.ts:12-42`).
- Lane questions: production scanner libs on quad miss; crop-fail vs continue-vision survey; DewarpNet/DocUNet/UVDoc usability for personal Node API in 2026; GPL spawn flag for unpaper/ScanTailor.
- Non-goals: select final recommendation; legal advice.

## Actions

- Read parent artifact and sibling lanes (quad-crop-detection, existing-tools-pipelines, repo-prep-insertion).
- Fetched and read primary sources 2026-08-31: jscanify `jscanify.js` + wiki API; scanic `README.md`, API reference, `src/index.js`, `src/mlDetector.js`; Scanbot `DocumentDetectionStatus` API docs + changelog; paperless-ngx `configuration.md` + `advanced_usage.md`; OCRmyPDF cookbook; unpaper README; ScanTailor Advanced LICENSE; DewarpNet/UVDoc/DocUNet official pages; py-reform/docuwarp PyPI; way2vat thermal-receipt blog; arXiv 2303.05763 receipt rectification paper.
- Did not edit parent artifact or product code.

## Miss-behavior table (production / installable libs)

Verified from source or official API docs unless noted.

| Library / product | On quad / document miss | Throws? | Returns original? | Returns null / empty output? | Structured status | Caller obligation | Evidence |
|-------------------|-------------------------|---------|-------------------|------------------------------|-------------------|-------------------|----------|
| **jscanify** `extractPaper` | No contour and no manual corners | No | No | **Yes — returns `null`** (JSDoc + code) | Implicit (`null` only) | Check `null` before using canvas | D1, D2 |
| **jscanify** `findPaperContour` | No contour | No | N/A | Returns `null` contour (`maxContourIndex === -1`) | None | Caller must gate warp | D1 |
| **jscanify** false positive | Contour found but `getCornerPoints` may leave corners **undefined**; `extractPaper` still warps (does not return `null`) | No | No | No (warp with undefined coords risk) | **No confidence score** | Caller must validate all four corners | D1, D3 |
| **scanic** classical `scanDocument` | No valid candidate contour | No | No | **`success: false`**, `output: null`, `corners: null`, `message: 'No document detected'` | `success`, `message`, optional `confidence` | Branch on `success` | D4, D5 |
| **scanic** ML `detector:'ml'` | `score < minScore` (default 0.5) or bad model output | No | No | Same shape; `message: 'No confident document (ml)'` | `success`, `score` (P(document)), `minScore` tunable | Branch on `success` / threshold | D6 |
| **scanic** `extractDocument` | Invalid corners object | No | No | `success: false`, `output: null` | `success`, `message` | Supply valid corners or handle fail | D4 |
| **Scanbot SDK** | No document in frame | No (status enum) | No auto-crop | No extracted page until user proceeds | **`ERROR_NOTHING_DETECTED`** (+ `ERROR_TOO_DARK`, `ERROR_TOO_NOISY`) | RTU UI can show acknowledge screen; optional **proceed anyway** (`documentNotFoundWarning`, changelog) | D7, D8 |
| **Scanbot SDK** | Image already full-frame | N/A | Treat as cropped | Returns `OK_BUT_ALREADY_CROPPED` with image-corner quad (recent versions) | Status enum | Different path than miss | D8 |
| **paperless-ngx** core | N/A — **no phone quad crop** in consume path | N/A | Original ingested | OCR pipeline runs on working copy | OCR settings only | Deskew/unpaper via OCRmyPDF defaults; optional `PAPERLESS_PRE_CONSUME_SCRIPT` | D9, D10 |
| **OCRmyPDF** | Deskew/clean failure on a page | CLI may error on fatal faults; deskew is best-effort per page | Input page retained if step skipped | N/A | CLI exit code | No perspective crop stage | D11 |
| **unpaper** | Auto deskew/clean **"will sometimes fail"** (README) | Process exit non-zero possible | Per-sheet step disable flags | N/A | CLI only | Operator reviews output; not an API | D12 |

**Summary:** Node geometry libs **do not throw** on miss — they return **`null` (jscanify)** or **`success: false` (scanic)**. Neither returns the uncropped image as a successful extract. jscanify can still produce a bad warp when a contour exists without four valid corners (no score gate).

## Crop-fail vs extract-vision — options with evidence (no decision)

Current budget-tools behavior (baseline): prep never crops; extract **always** runs vision on downsampled JPEG (C4–C5 parent evidence). Adding quad detect introduces a policy fork.

| Option | Behavior | Pros (evidence) | Cons / risks | Supporting evidence |
|--------|----------|-----------------|--------------|---------------------|
| **A — Fail extract** | No quad → HTTP error; no OpenRouter call | Matches fail-loud; avoids paid vision on known-bad geometry; scanic/jscanify already expose explicit miss | User gets no OCR attempt on hard photos; may need retry UX | D4, D1; host root-cause rule |
| **B — Continue vision on uncropped preprocessed JPEG + loud prep status** | Quad miss → skip warp; still `normalise`/`resize`; return `prepStatus: 'no_quad'` (or similar) in extract result | Scanbot RTU allows **proceed anyway** when document not found (configurable warning); vision may still read large receipts; preserves today's "always try" path | Silent-looking success if status ignored; homography benefit lost; may waste API cost | D7, D8; current `extractReceipt.ts:84` |
| **C — Fail prep, soft extract** | Prep throws/returns `Result` error; extract catches and either aborts or falls back per caller flag | Separates geometry contract from vision; testable seam (`ExtractReceiptInput.prep` injectable C7) | Two knobs; fallback branch risks silent skip if default is permissive | C7 parent; D4 |
| **D — Block auto-capture upstream** | Classify/camera stage refuses shutter until quad OK (Scanbot pattern) | Prevents bad uploads before API | Out of scope for API-only prep module; needs UI contract | D7 |
| **E — Manual corners** | scanic `createCornerEditor` / jscanify manual `cornerPoints` | Scanbot + scanic document human-in-the-loop correction | Not headless server default | D4, D3 |

**Product docs survey (miss / continue):**

- **jscanify:** Docs show `extractPaper` usage without miss handling; API documents `null` return only (D2, D3). No guidance to fall back to original image.
- **scanic:** README examples use `if (result.success)` before using corners/output (D5). Official API: `success: boolean` documents miss explicitly (D4).
- **Scanbot:** `ERROR_NOTHING_DETECTED` is a first-class status; changelog documents RTU **Acknowledge Screen** for document-not-found when `documentNotFoundWarning.visible` is true, with optional user proceed (D7, D8). Implies product default is **surface miss**, not silent crop.
- **paperless-ngx:** Ingest continues regardless; image prep is OCRmyPDF deskew/unpaper on flat scans, not quad miss (D9, D10). Custom pre-consume scripts can rewrite `DOCUMENT_WORKING_PATH` before OCR (D10).
- **OCRmyPDF:** Image pipeline is rotate → remove-background → deskew → clean; no detect-quad stage; failures are operational (CLI), not "no document" (D11).

## Curl / dewarp usability (2026, personal Node API)

**Homography limit (thermal receipt):** Thermal paper retains roll curl — a **developed surface**, not a plane. Industry note: homography assumes planar quad; curled receipts lack reliable corners; rectification needs dewarp or semi-rectangle models (D13). Academic receipt work (arXiv 2303.05763) uses affine/projective rectification but lists **curved/folded receipts as future work** (D14). CVPR 2005 developable-surface flattening and partition-based curl restoration are classical precedents for **non-planar** text (D15).

| Model / stack | What it fixes | Installable library? | Node API path? | Maintenance / maturity (2026-08-31) | Receipt / thermal note |
|---------------|---------------|----------------------|----------------|--------------------------------------|-------------------------|
| **Homography (scanic/jscanify/OpenCV)** | Camera perspective, table background crop | Yes (MIT npm) | Native WASM/JS | Actively maintained (scanic 1.6.0) | **Does not model curl**; may warp curled thermal incorrectly (D13) |
| **DewarpNet** (ICCV 2019) | Single-image doc unwarp (stacked 3D+2D nets) | **Research repo only** — `infer.py`, PyTorch checkpoints | Python subprocess only | README last updated models 2021; repo push 2024-11; **no PyPI/npm** | Trained on Doc3D synthetic; not receipt-specific (D16) |
| **DocUNet** (CVPR 2018) | Stacked U-Net unwarp | **Benchmark + eval code only** on project page; unofficial PyTorch reimpls (e.g. teresasun/docUnet.pytorch) | Python only | Official page offers dataset/eval, not pip package (D17) | Center-cropped doc images in benchmark, not phone-on-table receipts |
| **UVDoc** (SIGGRAPH Asia 2023) | Neural grid unwarp; Apache-2.0 weights | Official repo: `demo.py` + `model/best_model.pkl`; **PyPI wrappers**: `docuwarp` 1.0.2 (2024-07), `py-reform` 0.1.3 (2025-02); ONNX export `uvdoc-grid-onnx` (~30 MB) | Python / ONNX Runtime subprocess; **no Node binding** | UVDoc repo active; wrappers low-star, infrequent releases | General photographed documents; **not receipt-tuned**; needs ~720×496 infer then `cv2.remap` (D18, D19, D20) |
| **PaddleOCR `use_doc_unwarping`** | Optional module in OCR pipeline | Heavy Python stack | Sidecar only | Vendor-maintained | OCR-oriented; not a drop-in after quad crop (D21) |

**Usability verdict for parent (evidence only, no selection):** For a **personal Node TypeScript API**, DewarpNet and DocUNet remain **research / Python inference scripts**, not maintained Node libraries. UVDoc is the most **packaged** dewarp path in 2026 via small Python wrappers or ONNX, but still implies a **Python or ONNX sidecar**, extra model weight (~30 MB ONNX), and CPU latency not benchmarked here. None eliminate the need for a **planar crop stage** first; dewarp addresses **post-crop non-planarity** (curl/crumple). Thermal receipt curl specifically lacks published receipt-tuned dewarp benchmarks in sources reviewed.

## Copyleft flags (not legal advice)

| Tool | License (source) | Callable shape | Flag for MIT-ish personal Node module |
|------|------------------|----------------|---------------------------------------|
| **unpaper** | **GPL-2.0** — README: "entire `unpaper` project is licensed under GNU GPL v2" (D12) | CLI subprocess; ffmpeg I/O; deskew/margins on flat scans | **Keep out of Node module dependency tree**; subprocess still raises GPL **combined-work / mere aggregation** questions on distribution — **needs human license review**, not decided here |
| **ScanTailor / ScanTailor Advanced** | **GPL-3.0-or-later** (ScanTailor Advanced LICENSE file) (D22) | Interactive Qt app / batch projects; Python bindings exist (scantailor-advanced PyPI) but copyleft | Same flag: **not a permissive embed**; no phone-quad API |
| **paperless-ngx** | GPL-3.0 | App | Reference architecture only |
| **OCRmyPDF** | MPL-2.0 | Python API + CLI; invokes unpaper when `--clean` | MPL file-level copyleft; **unpaper subprocess still GPL** when clean enabled (D11, D12) |

**Planning implication (flag, not legal advice):** Parent criteria prefer MIT/Apache/BSD for the **Node prep module**. unpaper and ScanTailor should be treated as **out of scope for in-process or bundled use**; if ever used, only as **explicitly optional, separately installed CLIs** with license review. Aligns with parent W31–W33 (flat-scan GPL stacks, wrong geometry for phone receipts).

## Gaps

- No hands-on benchmark: curled thermal receipt fixtures through homography vs UVDoc/docuwarp on Windows Node host.
- jscanify undefined-corner warp path not exercised in CI here; severity on real receipts unmeasured.
- Scanbot "proceed anyway" default and Node SDK surface not read line-by-line (mobile API docs only).
- GPL subprocess interaction with proprietary/personal deployment not reviewed by counsel (intentionally flagged only).
- DocUNet/DewarpNet pretrained Node/ONNX ports not exhaustively searched beyond official + top PyPI hits.
- ML dewarp latency and vision-quality delta on budget-tools JPEG size (1280px) unknown.

## Stop

Cycle 1 Wave 2 deeper lane **saturated** for stated questions: miss behaviors verified in jscanify + scanic source; crop-fail policy options framed with Scanbot/paperless/OCRmyPDF/jscanify/scanic evidence; dewarp stacks classified as research vs Python-sidecar; GPL tools flagged for exclusion from Node module. Further web search likely redundant unless parent adds fixture benchmarks or license counsel input.

## Evidence relationships

```
Parent Q4/Q9 (fail-loud, licenses)
    │
    ├─► Node quad libs ──► jscanify null (D1–D3) │ scanic success:false (D4–D6)
    │
    ├─► Crop-fail policy fork ──► Scanbot ERROR_NOTHING_DETECTED + proceed UX (D7–D8)
    │                         └─► paperless/OCRmyPDF ingest-always flat-scan (D9–D11)
    │                         └─► Current extract always-vision baseline (C4–C5)
    │
    ├─► Thermal curl ──► homography insufficient (D13–D15)
    │                 └─► DewarpNet/DocUNet research-only (D16–D17)
    │                 └─► UVDoc + wrappers ONNX/Python (D18–D20)
    │
    └─► Copyleft ──► unpaper GPL-2 (D12), ScanTailor GPL-3 (D22) → exclude from Node module (flag)

Sibling lanes: quad-crop-detection (W23–W26), existing-tools-pipelines (W31–W33),
repo-prep-insertion (C1–C8)
```

### Evidence index

| ID | Claim | Source | Retrieved |
|----|-------|--------|-----------|
| D1 | jscanify `extractPaper` returns `null` when `maxContour == null` and no `cornerPoints`; otherwise warps | https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify.js | 2026-08-31 |
| D2 | jscanify wiki: `extractPaper` return type `HTMLCanvasElement \| null` | https://github.com/puffinsoft/jscanify/wiki/API | 2026-08-31 |
| D3 | jscanify README: solid background recommended; no miss-handling fallback documented | https://raw.githubusercontent.com/puffinsoft/jscanify/master/README.md | 2026-08-31 |
| D4 | scanic API: `ScannerResult.success`, `message`, `corners \| null`, `output \| null` | https://marquaye.github.io/scanic/api/reference.html | 2026-08-31 |
| D5 | scanic README: `if (result.success)` before using corners | https://raw.githubusercontent.com/marquaye/scanic/main/README.md | 2026-08-31 |
| D6 | scanic ML: `minScore` default 0.5; `success` false when below; never throws | https://raw.githubusercontent.com/marquaye/scanic/main/src/mlDetector.js | 2026-08-31 |
| D7 | Scanbot `DocumentDetectionStatus` includes `ERROR_NOTHING_DETECTED` | https://api-docs.scanbot.io/document-scanner-sdk/react-native/v7.0.0/types/index.DocumentDetectionStatus.html | 2026-08-31 |
| D8 | Scanbot changelog: `documentNotFoundWarning` + acknowledge / proceed behavior | https://docs.scanbot.io/android/document-scanner-sdk/changelog/ | 2026-08-31 |
| D9 | paperless `PAPERLESS_OCR_DESKEW` default true; `PAPERLESS_OCR_CLEAN` default clean via unpaper | https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/configuration.md | 2026-08-31 |
| D10 | paperless pre-consume script hooks; modifies `DOCUMENT_WORKING_PATH` before OCR | https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/advanced_usage.md | 2026-08-31 |
| D11 | OCRmyPDF pipeline: rotate → remove-background → deskew → clean (unpaper); no quad crop | https://raw.githubusercontent.com/ocrmypdf/OCRmyPDF/main/docs/cookbook.md | 2026-08-31 |
| D12 | unpaper GPL-2.0; auto processing sometimes fails; CLI deskew not perspective | https://raw.githubusercontent.com/unpaper/unpaper/main/README.md | 2026-08-31 |
| D13 | Thermal receipt curl breaks planar homography; industry uses dewarp/semi-rectangle | https://way2vat.com/the-weird-case-of-the-non-rectangular-rectangle/ | 2026-08-31 |
| D14 | Receipt smartphone rectification: projective only; curl/fold future work | https://ar5iv.labs.arxiv.org/html/2303.05763 | 2026-08-31 |
| D15 | Developable-surface / partition curl restoration precedents | https://doi.org/10.1109/cvpr.2005.163 ; https://www.sciencedirect.com/science/article/abs/pii/S0262885606000904 | 2026-08-31 |
| D16 | DewarpNet: research training/infer repo; PyTorch checkpoints; no npm | https://raw.githubusercontent.com/cvlab-stonybrook/dewarpnet/master/README.md | 2026-08-31 |
| D17 | DocUNet: benchmark + eval code download; learning-based unwarp paper page | https://www3.cs.stonybrook.edu/~cvl/docunet.html | 2026-08-31 |
| D18 | UVDoc official repo: demo.py, best_model.pkl, Apache-2.0 cited in README | https://raw.githubusercontent.com/tanguymagne/UVDoc/main/README.md | 2026-08-31 |
| D19 | docuwarp PyPI 1.0.2: UVDoc ONNX inference wrapper | https://pypi.org/project/docuwarp/ | 2026-08-31 |
| D20 | py-reform PyPI 0.1.3: `straighten(..., model="uvdoc")`; MIT library | https://pypi.org/project/py-reform/ | 2026-08-31 |
| D21 | PaddleOCR optional `use_doc_unwarping` flag | https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det | 2026-08-31 |
| D22 | ScanTailor Advanced GPL-3.0-or-later | https://raw.githubusercontent.com/4lex4/scantailor-advanced/master/LICENSE | 2026-08-31 |

---

## Compact return (parent worker)

- **Status:** complete
- **Path:** `.cursor/rpi-tracking/research/subagents/2026-08-31/fail-loud-and-curl-subagent-research.md`
- **Claims:**
  - jscanify `extractPaper` → `null` on no contour (no throw); contour-with-bad-corners still warps — https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify.js
  - scanic → `success: false`, `output: null`, message string; ML gates on `minScore` 0.5 — https://raw.githubusercontent.com/marquaye/scanic/main/src/index.js , https://raw.githubusercontent.com/marquaye/scanic/main/src/mlDetector.js
  - Scanbot → `ERROR_NOTHING_DETECTED`; RTU can warn or let user proceed — https://api-docs.scanbot.io/document-scanner-sdk/react-native/v7.0.0/types/index.DocumentDetectionStatus.html
  - paperless/OCRmyPDF → no quad stage; ingest + deskew/unpaper on flat scans — https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/configuration.md , https://raw.githubusercontent.com/ocrmypdf/OCRmyPDF/main/docs/cookbook.md
  - Thermal curl breaks planar homography; dewarp is separate stage — https://way2vat.com/the-weird-case-of-the-non-rectangular-rectangle/
  - DewarpNet/DocUNet → research/Python inference, not Node libs — https://raw.githubusercontent.com/cvlab-stonybrook/dewarpnet/master/README.md , https://www3.cs.stonybrook.edu/~cvl/docunet.html
  - UVDoc usable via Python/ONNX sidecar (docuwarp, py-reform); not Node-native — https://pypi.org/project/docuwarp/ , https://pypi.org/project/py-reform/
  - unpaper GPL-2.0, ScanTailor Advanced GPL-3.0 — flag keep out of Node module; spawn = license review — https://raw.githubusercontent.com/unpaper/unpaper/main/README.md , https://raw.githubusercontent.com/4lex4/scantailor-advanced/master/LICENSE
- **Gaps:** no fixture benchmarks; GPL distribution not reviewed; jscanify bad-corner warp severity unmeasured
- **Stop:** lane questions answered from primary sources; further search redundant without fixtures or counsel
