<!-- markdownlint-disable-file -->

# Lane Research: Contrarian — skip crop, trust vision

| Field | Value |
|-------|-------|
| Date | 2026-08-31 |
| Cycle | 1 |
| Wave | Contrarian |
| Lane | Challenge "must crop/perspective before OpenRouter vision"; seek skip-crop evidence and counter-evidence |
| Posture | expansive |
| Status | Complete (cycle 1 wave 3) |
| Artifact path | .cursor/rpi-tracking/research/subagents/2026-08-31/contrarian-skip-crop-vision-subagent-research.md |
| Parent artifact (read-only) | .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md |

## Lane questions

1. ReceiptBench / vendor vision OCR papers: does perspective crop materially change line-item accuracy vs raw phone photo?
2. arXiv 2511.04161 and similar: rotation hurts; does background clutter / perspective similarly hurt?
3. Scanbot / Google Lens marketing vs measured need.
4. If crop misses, is "vision on uncropped + loud status" better than failing extract? Production scanner behavior (Scanbot ERROR_NOTHING_DETECTED optional proceed).

## Actions

- Read parent artifact (C1–C7, W48, W50), fail-loud lane, PRD prep AC.
- Read host code: prepReceiptImage.ts, extractReceipt.live.test.ts, fixture sources.json, docs/prds/receipt-taking.md.
- Fetched 2026-08-31: ReceiptBench ACL 2026 paper (arXiv 2605.22413 / ACL anthology PDF); arXiv 2511.04161 HTML; DocScanner arXiv 2110.14968; Scanbot DocumentDetectionStatus + Android changelog; bibliotekanauki receipt preprocessing PDF; RCTK OCR benchmark case study; Scanbot AcknowledgementScreen types.

## Claims that SUPPORT skip-crop (vision on downsampled uncropped JPEG)

| ID | Claim | Source | Confidence | Notes |
|----|-------|--------|------------|-------|
| S1 | Host already sends downsampled color JPEG with no crop/deskew; only EXIF rotate, normalise, resize q80 | apps/api/src/features/receipts/pipeline/prepReceiptImage.ts:12-42 | high | Current production prep contract |
| S2 | Live OpenRouter extract tests pass on five Wikimedia photographed grocery receipts (vendor, date, printed total) using default prep — no geometry stage | apps/api/src/features/receipts/__tests__/extractReceipt.live.test.ts:24-138 | high | **Internal empirical counter-evidence** to mandatory crop; fixtures are real phone/scan photos, not rendered PNGs |
| S3 | ReceiptBench (10,656 real-world receipt images) evaluates MLLMs on collected images with natural visual variation; **no crop/perspective ablation** and authors did **not** add rotation/blur stress tests — models still reach ~0.80 overall F1 (fine-tuned Qwen3-VL-8B) on raw images | ACL 2026 ReceiptBench paper (arXiv 2605.22413), Limitations §5.4 | high | Benchmark proves VLMs can reason on diverse uncorrected receipts at scale; does **not** prove crop would not help |
| S4 | arXiv 2511.04161: **Gemini-2.5 Flash** field OCR on SROIE drops only 70.10% → 69.67% without rotation correction; free-form ANLS 22.43 → 26.24 word-level — paper states Flash "may already implement internal rotation handling" and is "highly robust" to rotation | arXiv 2511.04161 Table 3–4, §6 (retrieved 2026-08-31) | high | Suggests some frontier VLMs tolerate certain geometric errors without explicit server-side prep |
| S5 | RCTK 1,497-document benchmark: VLM receipt workflow ~97.3% field accuracy vs ~75.7% deep-learning OCR baseline on Type C receipts | rctk.com/case-studies/ocr-benchmark (retrieved 2026-08-31) | medium | Supports "VLMs read messy receipts"; **does not document** whether images were pre-cropped; receipts described as "scanned" |
| S6 | Vendor blog (invoice extraction): modern VLMs tolerate moderate skew (~10°), uneven phone lighting, light noise without manual binarization; aggressive binarization can **hurt** table/line structure | invoicedataextraction.com OCR preprocessing guide (retrieved 2026-08-31) | medium | Argues less classical prep for VLM path; not receipt-specific controlled study |
| S7 | imagetotable.ai job-site receipt guide: scanning apps that crop/contrast "can strip image data"; recommends feeding **raw camera photo** unless A/B shows scanned version wins | imagetotable.ai blog (retrieved 2026-08-31) | low–medium | Practitioner contrarian; anecdotal, not peer-reviewed |

**Speculation (flagged):** Skip-crop may be "good enough" for header keys (vendor/date/total) on many tabletop photos because VLMs attend globally; line-item structure (ReceiptBench Task 4) remains the bottleneck regardless of crop.

## Claims that SUPPORT required-crop (or geometry prep)

| ID | Claim | Source | Confidence | Notes |
|----|-------|--------|------------|-------|
| R1 | **Product constraint:** PRD AC "Prep before read" — processed image must include crop/deskew/contrast; "Prep is quality and cost control, **not optional garnish**" | docs/prds/receipt-taking.md:116 | high | Weigh as product intent, not disproved by technical counter-evidence |
| R2 | PRD rationale: ReceiptBench shows frontier models alter lines / invent tax; prep exists partly to reduce VLM papering-over failures | docs/prds/receipt-taking.md:112 | high | Argues for pipeline gates + prep quality, not strictly for quad crop |
| R3 | DocUNet Benchmark (130 mobile photos incl. receipts): **uncorrected** distorted images CER **0.535 / 0.509** (Tesseract) vs **0.165 / 0.149** after DocScanner-L rectification — ~3× character error reduction | DocScanner arXiv 2110.14968 Table 2 (retrieved 2026-08-31) | high | Measured on **classical OCR after** foreground localization + dewarp; not OpenRouter JSON extract; still strong evidence geometry matters for text readout |
| R4 | DocScanner explicitly **removes background** before rectification; authors state localization lets rectification focus on geometry "without extra learning on localizing the document" | DocScanner arXiv 2110.14968 §3.1, Fig. 1 | high | Perspective crop and background removal are coupled in SOTA rectification stacks |
| R5 | arXiv 2511.04161: rotation misalignment **degrades** OCR/VLM — GPT-4o rotation classification **59.58%** vs dedicated module **96.81%**; Tesseract SROIE field accuracy **49.06%** upright vs **24.06%** rotated; docTR **64.54%** vs **15.63%** | arXiv 2511.04161 Table 2–3 | high | Direct evidence geometric misalignment hurts; paper tests **rotation**, not perspective crop |
| R6 | Same paper conclusion lists **future work: arbitrary angle rotation, skew correction** — perspective/skew not evaluated in ORB | arXiv 2511.04161 §7 | high | **Gap:** cannot infer perspective impact from this paper alone |
| R7 | Classical receipt preprocessing study (240 Polish phone photos): preprocessing (edge find, straighten, ROI) improved character recognition **~25%** and words **>35%** vs raw; notes failures when **large background** in frame | bibliotekanauki.pl preprocessing PDF (retrieved 2026-08-31) | medium | Pre-VLM era; supports crop/background rejection for OCR |
| R8 | Scanbot production API: `OK_BUT_BAD_ANGLES` = document detected but **too much perspective distortion**; `ERROR_TOO_NOISY` = no document, likely **complex background** | Scanbot DocumentDetectionStatus API docs v7.0.0 (retrieved 2026-08-31) | high | Commercial scanner treats perspective and clutter as first-class quality failures |
| R9 | Scanbot RTU UI: `ERROR_NOTHING_DETECTED` maps to acknowledge screen with **`documentNotFoundWarning`** and configurable **`proceedAnywayButton.documentNotFound`** — user may continue without auto-crop | Scanbot AcknowledgementScreenConfiguration.d.ts; Android changelog 2025+ (retrieved 2026-08-31) | high | Production default surfaces miss; proceed is **optional UX**, not silent fallback |
| R10 | Google Lens / Adobe Scan marketing: built-in edge detection, perspective correction, shadow removal before OCR — no public accuracy tables | odysse.io Google Lens article; imagetotable 2026 scanner roundup (retrieved 2026-08-31) | medium (marketing) | Industry assumes crop/perspective; **not measured evidence** |
| R11 | TokenSqueeze (Devpost): claims ~98% of receipt photo pixels are "waste" (table/background) when asking VLM a narrow question; advocates OpenCV crop for cost | devpost.com/software/v1-la4vc6 (retrieved 2026-08-31) | low | Hackathon marketing; supports crop for **cost**, not accuracy |

## Question-by-question synthesis

### Q1 — ReceiptBench / papers: crop vs raw for line-item accuracy?

| Finding | Evidence |
|---------|----------|
| **No published ReceiptBench ablation** comparing perspective-cropped vs uncropped inputs | ReceiptBench Limitations: no systematic rotation/blur augmentation; evaluation on collected images as-is (S3) |
| ReceiptBench reports line-item / nested `detail` parsing as **bottleneck across all baselines** (F1 well below header fields) — problem is structural reasoning, not documented as fixable by crop alone | ReceiptBench Table 3, §5.2 |
| Closest measured geometry signal: DocUNet/DocScanner receipt subset — rectification + background strip materially lowers Tesseract CER (R3–R4) | DocScanner Table 2 |
| **Unanswerable without new experiment:** line-item F1 delta from quad crop on ReceiptBench or budget-tools fixtures | named gap G1 |

### Q2 — arXiv 2511.04161: rotation vs clutter/perspective?

| Geometry issue | Evidence in 2511.04161 | Clutter / perspective |
|----------------|------------------------|------------------------|
| 90°/180° rotation | Large drops for Tesseract, docTR, many VLMs on SROIE + SynthDog (R5) | Not tested |
| Frontier VLM robustness | Gemini-2.5 Flash near-flat under rotation (S4) | Not tested |
| Background / table | — | **Not in paper**; failure analysis cites padding/margins/off-center text, not tabletop clutter |
| Perspective / trapezoid | — | **Explicitly deferred** to future skew work (R6) |
| Analog from production scanners | — | Scanbot `OK_BUT_BAD_ANGLES`, `ERROR_TOO_NOISY` (R8) imply vendor belief perspective/clutter matter |

**Inference (medium confidence, not paper-direct):** Rotation harm does not automatically equal perspective harm, but DocScanner + Scanbot + classical prep (R3–R4, R7–R8) suggest uncropped tabletop photos with heavy background are a distinct failure mode from pure rotation.

### Q3 — Scanbot / Google Lens marketing vs measured need

| Source | Marketing claim | Measured need in sources |
|--------|-----------------|--------------------------|
| Google Lens | Auto edge detect, perspective correct, enhance | **No public benchmark** (R10) |
| Adobe Scan / Scanbot | Real-time quad, perspective, quality gates | Scanbot exposes perspective/noise enums (R8); proceed-on-miss is UX config (R9) |
| DocScanner / DocUNet | N/A (research) | CER ~0.53 → ~0.15 on mobile doc photos incl. receipts (R3) |
| Host live tests | N/A | Five uncropped photos extract OK (S2) |

Marketing consistently assumes crop; **peer-reviewed receipt-VLM work does not re-test that assumption**.

### Q4 — Crop miss: vision + loud status vs fail extract?

| Option | Production precedent | Trade-off |
|--------|---------------------|-----------|
| **Fail extract on no quad** | scanic/jscanify return null / success:false; no throw (parent W50) | Fail-loud, no API spend; user gets nothing |
| **Continue vision + loud prep status** | Scanbot: `ERROR_NOTHING_DETECTED` → warning + optional **Proceed anyway** (R9); changelog: acknowledge screen when `documentNotFoundWarning.visible` | Matches today's host always-vision path (S1–S2); risks silent-looking success if status ignored |
| **Block at camera** | Scanbot live guidance states | Out of API-only scope |

**Evidence-based framing (no selection):** Scanbot treats miss as **user-visible quality state**, not hard block — but auto-crop is still the happy path. budget-tools live tests show vision can succeed without quad (S2), supporting continue+status for header keys; PRD still mandates prep when implemented (R1).

## Evidence relationships

```
PRD prep-not-garnish (R1)
    │
    ├─► Counter: host live tests pass uncropped (S1–S2)
    │
    ├─► Counter: ReceiptBench scores raw real-world images (S3)
    │
    ├─► Partial counter: Gemini Flash rotation-robust (S4) — rotation only
    │
    └─► Support crop: DocScanner CER 0.53→0.15 (R3–R4)
                    Scanbot BAD_ANGLES / TOO_NOISY (R8)
                    2511.04161 rotation hurts most engines (R5)
                    classical +25% OCR with prep (R7)

Crop miss policy
    ├─► Scanbot proceedAnyway documentNotFound (R9)
    └─► fail-loud lane Option B (parent W50 pointer)
```

## Gaps

| ID | Gap | Blocks |
|----|-----|--------|
| G1 | No ReceiptBench or SROIE ablation: cropped/warped vs uncropped for line-item F1 | Quantifying "goldplating" claim |
| G2 | arXiv 2511.04161 does not test perspective/trapezoid or background clutter | Extending rotation results to skip-crop |
| G3 | Live test fixtures (Walmart, Save Mart, etc.) — unknown how much table background / perspective each contains; sources.json notes rotation/downsample only | Generalizing S2 beyond fixture set |
| G4 | No A/B on budget-tools: prepReceiptImage vs prep+crop for gated/ungated rate and arithmetic gate | Product decision |
| G5 | RCTK / ReceiptBench do not isolate crop from "VLM vs OCR" | S5 strength |
| G6 | Google Lens / Lens-class apps: zero public receipt line-item accuracy with vs without auto-crop | R10 |

## Speculation register

| Item | Label |
|------|-------|
| Skip-crop sufficient for match keys on "reasonable" phone photos | **Speculation** — partially supported by S2, not by line-item benchmarks |
| Perspective hurts VLMs similarly to 90° rotation | **Speculation** — Scanbot enums suggest yes; ORB paper silent |
| Downsample to 1280px reduces need for crop (receipt fills fewer pixels) | **Speculation** — cost/attention argument only |
| Mandatory crop always improves OpenRouter repair pass | **Speculation** — no cited experiment |

## Stop

Cycle 1 Wave 3 contrarian lane **saturated** for stated questions. Further web search unlikely to yield crop-vs-uncropped VLM ablations without primary experiments (G1, G4). Parent should treat S2 as strongest host-specific skip-crop evidence and R1/R3/R5/R8 as strongest required-crop counterweight; ORB paper supports orientation prep more than perspective crop.

## Sources (retrieved 2026-08-31)

- S1/C host — apps/api/src/features/receipts/pipeline/prepReceiptImage.ts
- S2/C host — apps/api/src/features/receipts/__tests__/extractReceipt.live.test.ts
- S2/C host — apps/api/src/features/receipts/__tests__/fixtures/sources.json
- R1 — docs/prds/receipt-taking.md
- S3 — arXiv 2605.22413 / ACL 2026.acl-long.2135 (ReceiptBench)
- S4, R5, R6 — arXiv 2511.04161 (Seeing Straight)
- R3, R4 — arXiv 2110.14968 (DocScanner)
- R7 — bibliotekanauki.pl/articles/88364.pdf
- S5 — rctk.com/case-studies/ocr-benchmark
- S6 — invoicedataextraction.com/blog/ocr-preprocessing-invoice-extraction
- S7 — imagetotable.ai/blog/job-site-receipt-extraction-accuracy-guide
- R8 — api-docs.scanbot.io document-scanner-sdk v7 DocumentDetectionStatus
- R9 — cdn.jsdelivr.net scanbot-web-sdk AcknowledgementScreenConfiguration.d.ts; docs.scanbot.io android changelog
- R10 — odysse.io Google Lens; imagetotable.ai best-mobile-ocr-apps-2026
- R11 — devpost.com/software/v1-la4vc6 (TokenSqueeze)
