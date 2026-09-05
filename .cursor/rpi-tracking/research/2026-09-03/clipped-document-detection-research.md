<!-- markdownlint-disable-file -->

# Task Research: clipped-document-detection

| Field              | Value                                                                    |
|--------------------|--------------------------------------------------------------------------|
| Date               | 2026-09-03                                                           |
| Researcher / agent | rpi-research (inline; parent subagent; no worker dispatch)                                                  |
| Status             | Complete |
| Artifact path      | .cursor/rpi-tracking/research/2026-09-03/clipped-document-detection-research.md      |

## Research Brief

* What to research: How document/receipt scanners handle a document that is partially out of frame (e.g. a long thermal receipt photographed from the top half, paper running off the bottom). Collect evidence of solutions other people use after a 1 percent constant black pad around the image before Canny/contour detection backfired by selecting the pad-vs-photo rectangle as the document.
* Why it matters: The current Scanic detect path pads the still with a constant black frame so a clipped receipt can form a closed contour. That pad created a stronger full-frame rectangle than the paper edge, so the detector highlights the entire original image. Planning a replacement needs evidence of approaches that recover a partial quad without promoting the image border to the document.
* Audience or intended use: Parent implementation/planning of receipt capture detection (apps/web Scanic path). Comparison evidence, not a forced stack pick. Rank approaches that would not select the whole image as the receipt.
* Scope: External: OpenCV document-scanner tutorials and issues (touches the edge, document at border, padding), Bret Hajek Scanning Documents from Photos Using OpenCV and critiques, jscanify/wascanner/opencv-document-scanner GitHub issues, Scanbot / Google ML Kit / Dynamsoft partial-document docs, Stack Overflow findContours touching image border, academic/receipt OCR papers on incomplete quadrilaterals or truncated receipts, techniques named by the caller (replicate-edge pad, reject image-bounds contour, line-fitting left/right edges intersecting image border, Hough lines, vanishing point, open-contour close with image boundary, GrabCut, ML corner detectors such as DocCornerNet). Internal: current pad helper, Scanic detect wrapper, prior pad-related tests, prior quad-crop and fail-loud research.
* Non-goals: Implementing a fix in this phase. Rewriting Scanic. Choosing a commercial SDK as the product default. Full OCR pipeline research already covered in 2026-08-31 receipt-image-prep. Camera UX redesign except as it relates to clipped-paper detection.
* Criteria: Prioritize practical library/issue evidence over blog speculation. Every approach must report: what it does; source URL + date if possible; whether it is known to cause full-image detection; fitness for thermal receipts (tall, low contrast, may leave the frame on one side only). Rank approaches that would not select the whole image as the receipt.
* Requested outputs: Ranked comparison of approaches that avoid full-image false positives; evidence log with C# / W# IDs; why constant-color padding creates a full-frame false positive.
* Output mode: comparison

## Research Parameters

| Field                            | Value                                                                   |
|----------------------------------|-------------------------------------------------------------------------|
| Research question(s)             | Which documented detection approaches recover a receipt that runs off one image edge without selecting the whole image as the document? |
| Codebase scope                   | apps/web/src/components/review/classify/receiptDetectPad.ts; scanicReceiptPrep.ts; related tests; prior RPI research on Scanic/jscanify/quad crop |
| External scope                   | Open web: GitHub issues (jscanify, opencv-document-scanner, wascanner, document scanner clipped/out of frame/touches edge), Hajek blog, Stack Overflow, Scanbot/ML Kit/Dynamsoft docs, academic papers, OpenCV padding/border discussions |
| Initial internal candidate areas | apps/web/src/components/review/classify/receiptDetectPad.ts; scanicReceiptPrep.ts; __tests__/receiptDetectPad.test.ts; .cursor/rpi-tracking/research/subagents/2026-08-31/quad-crop-detection-subagent-research.md; scanic-jscanify-node-subagent-research.md; fail-loud-and-curl-subagent-research.md |
| Initial external candidate areas | Bret Hajek Scanning Documents from Photos Using OpenCV; puffinsoft/jscanify issues; tony-xlh/opencvjs-document-scanner; andor83/wascanner; Scanbot DocumentDetectionStatus; Google ML Kit Document Scanner; Dynamsoft DDN; Stack Overflow findContours touching border; DocCornerNet / DocAligner |
| Research posture                     | balanced                                                                                 |
| Posture provenance                   | default: bounded task with named source targets and supplied failure evidence (black-pad full-frame false positive); adjacent commercial/academic sources could change ranking |
| Explicit limits / deadline           | none; research-only; subagent must not spawn further workers                                                     |
| Posture-specific completion basis    | balanced scope coverage and adequate evidence: caller-named sources plus ranked approaches; remaining items not closely related enough to change ranking |
| Edits allowed during research?       | no, research-only                                                                                                  |
| Resolved evidence root               | .cursor/rpi-tracking/ default                                    |
| Known constraints / excluded sources | Research-only writes; no secrets; do not implement; commercial SDKs are evidence of behavior not default deps; prioritize library/issue evidence over blog speculation |

## Extension Registry and Provenance

* Precedence: platform and host safety; caller scope and criteria; matching repository instructions and enforced schemas; rpi-research contract; domain skills and specialists; examples and preferences.

| Kind                | Candidate                        | Match and provenance                              | Scoped authority or output contract          | Selected / skipped reason      |
|---------------------|----------------------------------|---------------------------------------------------|----------------------------------------------|--------------------------------|
| Instruction         | repository-spine.mdc | alwaysApply | pnpm, typed env, colocated tests | selected as later planning constraint |
| Instruction         | root-cause-over-workarounds.mdc | alwaysApply | no silent masking of detection failure | selected: ranking must not hide full-frame false positives |
| Instruction         | documentation-timeliness.mdc | docs | product docs | skipped: research artifact is temporal |
| Instruction         | elegance.mdc / ts-code-quality.mdc / test-placement.mdc | ts/tests | later implementation | skipped this phase: research-only |
| Skill               | rpi-research | caller research request | this phase | selected |
| Skill               | rpi-plan / rpi-implement | follow-on | not this phase | skipped |
| Skill               | frontend-design | UI | not detection-algorithm research | skipped |
| Research specialist | Task explore / generalPurpose | independent lanes | lane artifacts under research/subagents/2026-09-03/ | skipped: this agent is already a subagent; host forbids further spawn; investigate inline |

## User Participation and Research Decisions

| Checkpoint       | Questions or no-interaction rationale                       | Answers / unanswered      | Resulting decision or selected further research    |
|------------------|-------------------------------------------------------------|---------------------------|----------------------------------------------------|
| Intake           | Topic, failure evidence (1 percent black pad selects pad-vs-photo rectangle), named sources, ranked-list output, and thermal-receipt fitness criteria are fully specified. Comparison mode inferred because caller asked for a ranked list, not a single implementation pick. Interaction unavailable as a nested subagent. | no-interaction | Proceed balanced comparison; do not pick a product stack; rank approaches that avoid full-image detection |
| Direction change | not needed | n/a | n/a |
| Convergence      | Output mode is comparison, not convergence. Further cycles would repeat Hajek/Scanbot/Tropin sources. | no-interaction | Stop after cycle 1; record decision state without selecting one implementation |

## Scope and Success Criteria

* Scope: Evidence of how scanners and papers handle documents that touch or leave the image border; why constant-color padding causes full-frame false positives; ranked approaches that would not select the whole image as the receipt; fitness for tall low-contrast thermal receipts that leave the frame on one side.
* Assumptions: (1) Detection currently uses Scanic classical Canny/contour path with a constant black pad (verified C1 C2). (2) The observed failure is the pad-vs-photo rectangle winning over the paper contour (caller + C3 mapping assumes Scanic can return the pad contour). (3) A usable result may be a partial quad whose missing side is the image border, not a closed paper rectangle.
* Success criteria:
  * Every research question is answered or marked unanswerable with the missing evidence named.
  * Evidence is grounded in actual code, docs, or tooling results, with locations (path:line for code, URL + retrieval date for external).
  * Findings, decisions, and readiness claims cite Evidence Log IDs.
  * Alternatives are compared with trade-offs. Comparison mode records decision state without a forced implementation pick.
  * Open questions, risks, and residual uncertainty are recorded.
  * Self-check passes.

## Task Research Requests

* Explicit requests: Search named queries (OpenCV touches the edge / document at border / padding; Bret Hajek 5px border and critiques; jscanify edge/clipped issues; Scanbot, Google ML Kit, Dynamsoft partial documents; Stack Overflow findContours touching border; academic incomplete quadrilateral / truncated receipts; replicate-edge vs constant pad; reject contour matching image bounds; line-fitting; Hough; vanishing point; open contour closing with image boundary; GrabCut; ML corner detectors). GitHub issues for jscanify, opencv-document-scanner, wascanner, document scanner clipped OR out of frame OR touches edge. For each approach: what it does, URL+date, full-image-detection risk, thermal-receipt fitness. Rank approaches that would not select the whole image.
* Inferred research questions: See Research Questions table.
* Caller constraints and non-goals: Research-only. Prioritize library/issue evidence over blog speculation. Do not implement.

## Direction Controls

| Control type (add / change / narrow / exclude / discard) | Direction or boundary | Source / checkpoint  | Effect on active brief, evidence, or revalidation |
|----------------------------------------------------------|-----------------------|----------------------|---------------------------------------------------|
| add | Partial/out-of-frame document detection | user 2026-09-03 | Primary topic |
| add | Named source list and technique list | user 2026-09-03 | Must cover each named source or record unavailability |
| add | Rank approaches that would NOT select the whole image | user 2026-09-03 | Ranking criterion is anti-full-frame, not OCR quality |
| add | Thermal receipt fitness (tall, low contrast, one-side clip) | user 2026-09-03 | Filter on receipt geometry, not A4 page |
| exclude | Implementation in this phase | rpi-research + subagent | Write only research artifacts |
| discard | Keep 1 percent constant black pad as the intended fix | user failure evidence | Treat constant pad as a known-bad approach to explain, not recommend |

## Research Questions

|  # | Sub-question     | Type (depth / breadth / straightforward) | Priority  | Status                    |
|---:|------------------|------------------------------------------|-----------|---------------------------|
| Q1 | Why does constant-color padding create a full-frame false positive in Canny/contour document detectors? | straightforward | H | answered |
| Q2 | What do OpenCV tutorials and issues (including Hajek 5px border) actually do for documents that touch the image edge, and do critiques warn about the pad-as-document failure? | breadth | H | answered |
| Q3 | What do jscanify, wascanner, opencv-document-scanner, and Scanic GitHub issues say about clipped / out-of-frame / edge-touching documents? | breadth | H | answered |
| Q4 | How do commercial detectors (Scanbot, Google ML Kit, Dynamsoft) treat partial documents? | breadth | M | answered |
| Q5 | What Stack Overflow / OpenCV answers exist for findContours when the object touches the image border? | depth | H | answered |
| Q6 | What academic/receipt OCR papers say about incomplete quadrilaterals or truncated receipts? | breadth | M | answered |
| Q7 | For each named technique (replicate-edge pad, reject image-bounds contour, line-fit to border, Hough, vanishing point, open-contour close, GrabCut, ML corner detectors), what does it do, does it cause full-image detection, and is it fit for thermal receipts? | depth | H | answered |
| Q8 | Which of those approaches are evidenced to avoid selecting the whole image, and how should they be ranked for this product? | depth | H | answered |

## Prior Knowledge Gate

* Existing artifacts reviewed: .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md; .cursor/rpi-tracking/research/subagents/2026-08-31/quad-crop-detection-subagent-research.md; scanic-jscanify-node-subagent-research.md; fail-loud-and-curl-subagent-research.md; apps/web/src/components/review/classify/receiptDetectPad.ts; scanicReceiptPrep.ts
* Reused (verified) findings: Classical Canny/findContours/approxPolyDP is the Scanic/jscanify family (quad-crop lane). Scanbot has OK_BUT_ALREADY_CROPPED when the image is already full-frame (fail-loud lane, confirmed and extended W12 W13). No prior artifact researched clipped-at-border paper as a distinct failure mode.
* Superseded / stale: 2026-08-31 quad-crop research excluded commercial SDKs from recommendation; this cycle includes them as behavior evidence only. Current product now pads with constant black before Scanic detect; that pad is the failure under study.

## Research Cycle Log

### Cycle 1

* Active direction controls: add clipped detection; named sources; anti-full-frame ranking; thermal fitness; exclude implementation; discard constant black pad as intended fix
* Active research posture and completion basis: balanced; caller-named sources plus ranked approaches with adequate evidence
* Explicit limits or deadline effect: no worker dispatch; inline web+code investigation

#### Wave 1: Wider

* Plan and independent lanes: inline (no spawn). Cover Hajek, OpenCV padding/border, GitHub issues for jscanify/wascanner/opencv-document-scanner, commercial SDKs, Stack Overflow, papers, named techniques.
* Worker evidence relationships or inline fallback: Q1-Q8 mapped to W1-W22 and C1-C5. GitHub issue searches returned jscanify #18 (white pad for incomplete documents, not merged) and #30 (receipt fail from textured background, not clipping). wascanner and tony-xlh/opencvjs-document-scanner had zero matching clip/out-of-frame/touches-edge issues.
* Reflection: The blog-level 5px pad story is incomplete. Hajek source (not the blog) rejects near-full-image area. Scanbot treats partial documents as a first-class error status, not as a crop. Line/Hough methods exist specifically because closed-contour detectors fail when a side is missing.

#### Wave 2: Deeper

* Parent-prioritized material from Wave 1: Hajek MAX_COUNTOUR_AREA; Scanbot PartiallyVisibleDocumentConfiguration; Tropin Hough fourth-side reconstruction; LearnOpenCV GrabCut limitation; jscanify #18; SO 40615515 / 62634856; DocCornerNet output range.
* Plan and independent lanes: inline fetch of Hajek page.py, Scanbot d.ts, DocCornerNet model card, Tropin PDF, LearnOpenCV GrabCut section, Hajek gist.
* Worker evidence relationships or inline fallback: Hajek page.py MAX_COUNTOUR_AREA = (width-10)*(height-10) is the missing anti-full-frame gate (W3). Scanbot distinguish OK_BUT_ALREADY_CROPPED vs ERROR_PARTIALLY_VISIBLE (W12 W13). Tropin reconstructs missing side using known aspect ratio plus camera principal point (W18) which thermal receipts lack. GrabCut cannot scan when a corner is outside the image (W10). DocCornerNet coords are normalized 0-1 with no off-image representation (W20).
* Reflection: The product copied Hajek's pad and omitted Hajek's area cap. That is the root cause of the backfire, not padding in the abstract.

#### Wave 3: Contrarian

* In-scope challenge targets and boundaries: (a) reject-bounds also rejects a receipt that truly fills the frame; (b) reconstructing missing paper with homography invents pixels; (c) Tropin aspect-ratio reconstruction is wrong for variable-length thermal rolls; (d) Scanbot default is refuse partial, not crop the visible stub; (e) replicate pad alone does not close a contour; (f) ML always emits four in-frame corners.
* Plan and independent lanes: inline. Scanbot alreadyCroppedScore vs partial displacement; MIDV-500 GT quads may lie outside the image; SROIE is whole scanned receipts not phone clips.
* Worker evidence relationships or inline fallback: W12 already-cropped is a separate status from partial. W19 MIDV-500 labels quads even when the document is outside the frame (corners may be outside image). W21 SROIE does not study page-quad clipping. W10 GrabCut fails rather than selecting full frame. C4 Scanic exposes minDocumentCoverageRatio (a minimum), which prefers large quads and would favor the pad rectangle.
* Reflection: Anti-full-frame ranking must keep two different successes: (1) overlay the visible paper and pin the missing side to the image border; (2) if the photo is already a cropped slip, accept full-frame as already-cropped rather than as a pad false positive. Discriminator is whether the rectangle was created by padding.

#### Parent Synthesis and Disposition

| Material / claim | Evidence IDs or worker pointers | Parent disposition (accepted / rejected / deferred) | Evidence-based rationale | Primary-artifact treatment  |
|------------------|---------------------------------|-----------------------------------------------------|--------------------------|-----------------------------|
| Constant-color pad creates a Canny rectangle around the original photo that largest-quad detectors prefer | C1 C2 C3 W1 W2 W3 W6 | accepted | Matches caller failure; Hajek source even caps area to avoid this | Q1 finding |
| Hajek 5px pad is safe because 5px is small | W1 vs W3 | rejected | Blog omits MAX_COUNTOUR_AREA; without the cap the pad is the same failure | Q2 finding |
| Copy Hajek pad without the area cap | C1 C2 vs W3 | rejected | Product has pad, no max-area reject | current-bad alternative |
| Line-fit / Hough / open-contour close with image border recovers one-side clips without a closed 4-gon | W8 W9 W16 W17 W18 W19 | accepted as leading recovery family | Designed for missing sides; does not need the pad rectangle | rank 1-2 recovery |
| Tropin fourth-side via known aspect ratio | W18 | deferred / weak for thermal | Thermal roll length is not a known A4-like ratio | Q6 Q7 |
| GrabCut for clipped documents | W10 | rejected for this failure | Author states GrabCut cannot scan when a corner is outside | alternative |
| Scanbot auto-crops partial documents | W12 W13 | rejected | Default allowPartiallyVisibleDocuments=false; status is ERROR_PARTIALLY_VISIBLE | Q4 |
| DocCornerNet natively represents off-image corners | W20 | rejected | coords in 0-1; missing corners snap into the frame | Q7 |
| jscanify/wascanner/opencv-document-scanner have issue threads on clipped paper | W4 W5 | accepted as negative search | #18 is a white-pad patch not merged; other repos empty | Q3 |
| Receipt OCR papers (SROIE) cover truncated page quads | W21 | rejected | SROIE is whole scanned receipts; text quads not page crop | Q6 gap |

#### Cycle Re-entry Evaluation

* Another complete three-wave cycle needed: no
* Trigger or stop basis: named sources covered; ranking is evidence-backed; next sources are redundant Scanbot changelogs and more OpenCV tutorial clones of Hajek
* Revised brief or revalidation required: none
* Readiness effect: Ready for comparison-mode planning (no stack pick)

## Evidence Log

* Delegation: inline: this agent is already a nested subagent; host forbids further spawn

### Codebase Evidence

| ID | Claim / finding | Location (`path:line`)           | Tool                                | Confidence       | Notes       |
|----|-----------------|----------------------------------|-------------------------------------|------------------|-------------|
| C1 | Product pads stills with constant black (#000000) at 1 percent of short side (min 8 px after Scanic downscale) so a clipped receipt can form a closed contour | apps/web/src/components/review/classify/receiptDetectPad.ts:3-75 | read | high | RECEIPT_DETECT_PAD_FILL is #000000; comment states closed paper contour |
| C2 | scanReceiptImage runs Scanic detect on the padded copy, then maps corners back and clamps onto the original still | apps/web/src/components/review/classify/scanicReceiptPrep.ts:51-73 | read | high | Comment: Detection runs on a black-padded copy so a clipped receipt still has a closed contour |
| C3 | Tests expect the pad to pin clipped paper to the original edge when Scanic finds the pad contour | apps/web/src/components/review/classify/__tests__/receiptDetectPad.test.ts:80-98 | read | high | Mapping clamps pad-found corners onto original bounds; does not reject a full-frame quad |
| C4 | Scanic DetectionOptions expose minArea and minDocumentCoverageRatio (minima), maxDocumentAspectRatio, no max-coverage / image-bounds reject | apps/web/node_modules/scanic/src/scanic.d.ts:190-203 | read | high | Minima prefer large quads; a pad rectangle would score well. maxDocumentAspectRatio can punish tall receipts |
| C5 | Prior fail-loud lane already recorded Scanbot OK_BUT_ALREADY_CROPPED as a distinct full-frame path | .cursor/rpi-tracking/research/subagents/2026-08-31/fail-loud-and-curl-subagent-research.md:42 | read | high | Confirmed and extended by W12 W13 this cycle |

### External Evidence

| ID | Claim / finding | Source (title) | URL     | Retrieved      | Version/date | Confidence       |
|----|-----------------|----------------|---------|----------------|--------------|------------------|
| W1 | Hajek: Canny ignores image sides so a page touching the border is not a closed edge; add a 5px border so the image edge can count as paper edge; subtract 5px after | Scanning Documents from Photos Using OpenCV | https://bretahajek.com/2017/01/scanning-documents-photos-opencv/ | 2026-09-03 | posted 2017-01; comment 2022-01-09 | high |
| W2 | Hajek preprocessing uses copyMakeBorder 5px BORDER_CONSTANT black before Canny | Breta01/handwriting-ocr page.py | https://raw.githubusercontent.com/Breta01/handwriting-ocr/master/src/ocr/page.py | 2026-09-03 | master fetch | high |
| W3 | Hajek contour picker requires 4-gon convex AND area strictly less than (width-10)*(height-10); default fallback is the (almost) full image corners | same page.py _find_page_contours | https://raw.githubusercontent.com/Breta01/handwriting-ocr/master/src/ocr/page.py | 2026-09-03 | master fetch | high |
| W4 | jscanify issue 18 (2023-11-13, closed/converted): user patch adds a white border to detect documents not completely contained inside the canvas; not merged into jscanify | puffinsoft/jscanify#18 | https://github.com/puffinsoft/jscanify/issues/18 | 2026-09-03 | 2023-11-13 / locked 2024-01-03 | high |
| W5 | GitHub issue search: no clip/out-of-frame/touches-edge issues in andor83/wascanner or tony-xlh/opencvjs-document-scanner; jscanify#30 is receipt miss from textured background, not clipping | GitHub issue search + jscanify#30 | https://github.com/puffinsoft/jscanify/issues/30 | 2026-09-03 | 2025-01-26 | high |
| W6 | OpenCV copyMakeBorder: BORDER_CONSTANT fills a uniform value; BORDER_REPLICATE copies edge pixels (no new intensity step at the original border) | OpenCV Adding borders tutorial | https://docs.opencv.org/2.4/doc/tutorials/imgproc/imgtrans/copyMakeBorder/copyMakeBorder.html | 2026-09-03 | OpenCV 2.4 docs | high |
| W7 | Pre-OpenCV 3.2 findContours ignored a 1-pixel image border so contours touching the edge were clipped; workaround was 1px constant-0 pad plus offset | SO 41592039 | https://stackoverflow.com/questions/41592039/contouring-a-binary-mask-with-opencv-python | 2026-09-03 | answers cite OpenCV 3.1 docs / 3.2 fix | high |
| W8 | Standard way to ignore/remove contours that touch image boundaries: test contour points or boundingRect against x=0 / y=0 / x=width-1 / y=height-1 | SO 40615515 (2016-11-16) | https://stackoverflow.com/questions/40615515/how-to-ignore-remove-contours-that-touch-the-image-boundaries | 2026-09-03 | 2016-11-16 | high |
| W9 | Document out of frame so Canny has a gap: findContours fails; suggested recovery is pad then Probabilistic HoughLines and crop by those lines (perp/parallel for 2-3 visible sides) | SO 62634856 (2020-06-29) | https://stackoverflow.com/questions/62634856/how-to-do-a-perspective-transformation-of-an-image-which-is-missing-corners-usin | 2026-09-03 | asked 2020-06-29, answer 2020-07 | high |
| W10 | LearnOpenCV GrabCut scanner: init rect inset 20px as background; When a part of the document is outside the image, a corner perhaps going missing, GrabCut cannot scan. This is the only limitation | Automatic Document Scanner using OpenCV | https://learnopencv.com/automatic-document-scanner-using-opencv/ | 2026-09-03 | page fetched 2026-09-03 | high |
| W11 | giochanturia document-cropper: dark padding before large-kernel morph so opening does not shove the page to the image boundary; then Canny + Hough + intersection clustering for corners | giochanturia/document-cropper README | https://github.com/giochanturia/document-cropper | 2026-09-03 | README via search 2026-09-03 | medium |
| W12 | Scanbot: allowPartiallyVisibleDocuments default false; when true, 1-3 visible corners yield ERROR_PARTIALLY_VISIBLE plus displacement vector, not an OK crop. Separate OK_BUT_ALREADY_CROPPED returns image-corner quad when the still is already a cropped document | scanbot-web-sdk@9.0.0 DocumentScannerTypes.d.ts | https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/@types/core/compiled/DocumentScannerTypes.d.ts | 2026-09-03 | SDK 9.0.0 types | high |
| W13 | Scanbot changelogs: partially visible documents disabled by default; auto and single-shot return ERROR_PARTIALLY_VISIBLE when configured | Scanbot Android / Web changelogs | https://docs.scanbot.io/android/document-scanner-sdk/changelog/ | 2026-09-03 | changelog pages 2026-09-03 | high |
| W14 | Google ML Kit Document Scanner is a closed UI (auto capture, edge crop, user edit). No public API for partial-document status or custom overlay. Not usable inside this web capture flow | ML Kit Document Scanner | https://developers.google.com/ml-kit/vision/doc-scanner | 2026-09-03 | Google developers docs | high |
| W15 | Dynamsoft DDN detects quads then normalizes; cropAndDeskewImage returns null if the quadrilateral is out of bounds; docs emphasize manual ImageEditorView refine. No Scanbot-like partial-visible status found | Dynamsoft document-normalizer-javascript README; Flutter ImageProcessor | https://github.com/Dynamsoft/document-normalizer-javascript ; https://www.dynamsoft.com/capture-vision/docs/mobile/programming/flutter/api-reference/utility/image-processor.html | 2026-09-03 | README / API | medium |
| W16 | IntSig-class patents: open contour whose bounding rect touches the image edge means the document is out of bounds (long receipt). Closed largest contour means in-frame | US 10171695 / 10257375 / 11140290 | https://patents.google.com/patent/US10171695 | 2026-09-03 | 2018-2019 patents | high |
| W17 | Randomized Hough Q-corners: a vertex can be virtual (not visible) if deduced from multiple visible edge lines of the same rectangle; contour-based OpenCV 4-gons fail under occlusion | ICIEA 2015 Multiple quadrilateral detection | https://www.cse.cuhk.edu.hk/~khwong/c15_Multiple_quadrilateral_detection_iciea15.pdf | 2026-09-03 | 2015 | high |
| W18 | Tropin et al. 2021: Hough document localization; reconstruct the missing fourth side from three lines using known aspect ratio and camera principal point / focal length. SmartDoc + MIDV-500 | Advanced Hough-based method for on-device document localization arXiv:2106.09987 | https://arxiv.org/abs/2106.09987 | 2026-09-03 | 2021-06-18 | high |
| W19 | MIDV-500 includes documents partially outside the frame; GT is still a quadrilateral (even if the document is completely out of frame); true aspect ratio is known | Tropin Computer Optics paper / MIDV description | https://computeroptics.ru/KO/PDF/KO45-5/450509.pdf | 2026-09-03 | Computer Optics 45(5) | high |
| W20 | DocCornerNet / scanic-ml: output coords [1,8] normalized 0-1 (TL TR BR BL); score is P(document present). No off-image bin. Dataset negatives have null corners (no document), not clipped-document labels | scanic-ml MODEL_CARD.md; HuggingFace DocCornerDataset | https://cdn.jsdelivr.net/npm/scanic-ml@0.2.0/MODEL_CARD.md ; https://huggingface.co/datasets/mapo80/DocCornerDataset | 2026-09-03 | scanic-ml 0.2.0 | high |
| W21 | ICDAR SROIE is 1000 whole scanned receipts with text-region quads, not page-boundary crop of a phone photo that runs off-frame | ICDAR2019 SROIE | https://rrc.cvc.uab.es/?ch=13 | 2026-09-03 | Huang et al. 2019 | high |
| W22 | DocTr++ (arXiv 2304.08796, 2023): most rectifiers assume complete document boundaries; partial-boundary and no-boundary cases need a different mapping; classical contour detectors are restricted to complete pages | Deep Unrestricted Document Image Rectification | https://arxiv.org/abs/2304.08796 | 2026-09-03 | 2023-04 | high |
| W23 | U-Net document localization survey: contour / Hough / LSD methods are robust to partial occlusion (missing corner) but sensitive to lighting and contrast | arXiv 2310.00937 | https://ar5iv.labs.arxiv.org/html/2310.00937 | 2026-09-03 | 2023-10 | medium |
| W24 | OpenCV.js live-scanner / Scanbot techblog classical recipe: largest 4-gon from Canny contours; no pad, no partial-document branch; miss prints No document detected | How to detect document edges in OpenCV | https://scanbot.io/techblog/document-edge-detection-with-opencv/ | 2026-09-03 | Scanbot techblog | high |

### Contradictions / Conflicts

* Hajek blog (W1) presents 5px constant pad as sufficient for edge-touching pages; Hajek source (W3) also rejects contours with area >= (width-10)*(height-10). Resolved by primary source (page.py) over the blog: the cap is load-bearing. Product copied the blog, not the cap.
* Scanbot OK_BUT_ALREADY_CROPPED (W12) returns the image-corner quad as success-like; ERROR_PARTIALLY_VISIBLE is a miss unless enabled. These are opposite treatments of a full-frame-looking quad vs a clipped document. Resolved as two different product states, not a conflict.
* SROIE "quadrilateral" (W21) is text-line boxes, not page crop. Do not treat SROIE as evidence for truncated page detection.

## Findings Mapped to Questions and Evidence

| Question | Finding             | Evidence IDs | Confidence          | Decision or readiness implication    |
|----------|---------------------|--------------|---------------------|--------------------------------------|
| Q1       | Constant pad inserts a high-contrast rectangle around the original photo. Canny draws that rectangle; largest/minArea 4-gon detectors pick it over the weaker paper edge. Hajek avoided this with an explicit max-area cap the product does not have. | C1 C2 C3 C4 W1 W2 W3 W6 | high | Do not keep constant pad without a bounds/area reject |
| Q2       | Hajek 5px black BORDER_CONSTANT is the canonical tutorial. Critiques are scarce as blog comments; the real critique is in his own MAX_COUNTOUR_AREA and in SO 62634856 (pad+Hough, not pad+largest contour). jscanify #18 independently proposed a white pad for incomplete documents and was not merged. | W1 W2 W3 W4 W9 | high | If pad is kept, copy the area cap, not just the 5px |
| Q3       | jscanify has no shipped clipped-document mode. #18 white-pad patch not merged. #30 receipt failure is textured background. wascanner and opencv-document-scanner: zero matching issues. Scanic classical options have min coverage, not max. | W4 W5 C4 | high | Do not expect an upstream library flag; wrap or replace detection |
| Q4       | Scanbot: partial is an error status with a camera-nudge vector; already-cropped is a separate full-frame success. ML Kit: closed UI, no partial API. Dynamsoft: detect quad + manual refine; out-of-bounds crop returns null. | W12 W13 W14 W15 | high | Commercial pattern is classify partial, do not silently crop as full page |
| Q5       | Two SO families: (A) reject contours that touch the border (40615515, microscopy); (B) pad 1px because old findContours clipped the border (41592039); (C) missing corners: pad then Hough lines (62634856). (A) is the opposite of clipping recovery unless applied to the pad rectangle only. | W7 W8 W9 | high | Use (A) on the pad-created rectangle; use (C) to recover paper |
| Q6       | Identity-doc literature (MIDV-500, Tropin, Q-corners, DocTr++) treats incomplete boundaries as a first-class case. Receipt OCR (SROIE) does not. Thermal length is not a known aspect ratio, so Tropin fourth-side reconstruction does not transfer. | W17 W18 W19 W21 W22 W23 | medium | Prefer intersecting visible sides with the image border over aspect-ratio completion |
| Q7       | See Alternatives. GrabCut fails on clipped pages (W10). Replicate pad avoids the false rectangle but does not close the paper (W6). ML snaps corners into 0-1 (W20). Open-contour patents match long receipts (W16). | W6 W8 W9 W10 W16 W17 W18 W20 | high | Rank recovery methods that never emit the photo rectangle |
| Q8       | Ranked list below. Top: reject pad/image-bounds quad; then fit visible long edges and close with the image border. Constant pad without a cap is last. | all | high | Comparison ready for planning |

## Key Discoveries

* The 1 percent black pad backfired for the same reason Hajek added a max contour area of (width-10)*(height-10): the pad-vs-photo edge is a perfect, high-contrast 4-gon larger than the paper.
* Production scanners that handle partial documents (Scanbot ML) do not auto-accept them as a crop. They emit ERROR_PARTIALLY_VISIBLE and a displacement. Full-frame success is a different status (OK_BUT_ALREADY_CROPPED).
* The geometry that fits a long thermal slip leaving one side is line-based (left/right edges + image-border intersections), not closed-contour approxPolyDP.
* jscanify / wascanner / opencv-document-scanner issue trackers do not document this failure. The only nearby jscanify evidence is an unmerged white-border patch.

### Why constant-color padding creates a full-frame false positive

Canny reports intensity steps. A constant fill (black in C1, white in W4, any uniform value in W6 BORDER_CONSTANT) against the original photo's mixed edge pixels is a strong step on all four sides of the original rectangle. findContours then returns that rectangle as a closed convex 4-gon. Detectors that pick largest area / minArea (C4, W24, jscanify largest contour) prefer it over the weaker thermal-paper edge. Mapping corners back (C2 C3) clamps that rectangle onto the original image, which is exactly "highlight the entire original photo." Hajek's unpublished-in-blog cap (W3) exists to drop that candidate. A 1 percent pad is thicker than Hajek's 5px after downscale, so the false rectangle is even cleaner.

Replicate-edge padding (W6 BORDER_REPLICATE) does not create that step, because pad pixels equal the photo edge. It therefore does not manufacture a full-image quad. It also does not close a clipped paper blob: the paper color continues into the pad, and the contour still meets the (new) image border as an open or border-touching shape (W8 W16).

## Alternatives and Decision State

### Decision State (non-convergence modes)

* State: proposed comparison outcome (ranked list). No single implementation selected.
* Rationale: caller asked for a ranked list of approaches that would not select the whole image, not a stack pick.
* Evidence refs: C1-C5, W1-W24
* Next owner or trigger: planning / implementer chooses among ranks 1-3

### Alternative: Constant-color pad + largest 4-gon (current)

* Approach: Black (or white) copyMakeBorder, run Canny/contours, take the winning quad, subtract pad.
* Trade-offs: Closes clipped paper in theory (W1 W4). In practice the pad rectangle wins (caller, C1-C3, W3).
* Evidence refs: C1 C2 C3 W1 W2 W4
* Rejection rationale: Known to cause full-image detection. Hajek only survived this with MAX_COUNTOUR_AREA (W3).

### Alternative: Constant pad + reject near-full-image area / bounds (Hajek source)

* Approach: Keep a small pad if desired, but drop any 4-gon whose area is nearly the padded canvas (W3) or whose bbox matches the original photo rectangle (W8 applied to the pad contour). Then take the next convex 4-gon, which may use the pad only on the clipped side.
* Trade-offs: Smallest change; stops the backfire. May still miss if the paper contour is not a 4-gon (torn/curl). Must not blindly reject a true full-frame slip: that is Scanbot already-cropped (W12), which can be the fallback when no smaller 4-gon exists (Hajek's own default page_contour).
* Evidence refs: W3 W8 W12
* Rejection rationale: not rejected; rank 1 anti-full-frame gate. Recovery of a clipped slip still needs a remaining paper 4-gon or a line-fit fallback.

### Alternative: Replicate-edge pad

* Approach: BORDER_REPLICATE (or CSS/canvas edge-extend) instead of constant fill.
* Trade-offs: Does not create the photo-rectangle Canny edge (W6). Does not close the paper. Must pair with open-contour or line-fit. Low risk of full-image detection.
* Evidence refs: W6 W7
* Rejection rationale: not a complete detector; rank as a pad variant under the gate.

### Alternative: Line-fit visible sides, intersect image border

* Approach: Canny or LSD/Hough on unpadded (or replicate-padded) image; keep long near-vertical lines as left/right paper edges; intersect with the image side the paper runs off (usually bottom). Optional top edge if visible. SO 62634856; giochanturia Hough intersections; Q-corners (W17).
* Trade-offs: Does not require a closed 4-gon. Matches the thermal one-side-clip case. Can pick table edges or printed receipt rules if contrast is low (jscanify#30 textured background W5). No full-image quad unless you also fit the four image borders as lines (filter those out).
* Evidence refs: W9 W11 W17 W23
* Rejection rationale: not rejected; rank 2 recovery for this product.

### Alternative: Open-contour close with image boundary

* Approach: Segment paper vs table; if the largest region is an open contour whose bbox touches an image edge, that side is out of frame; close the polygon with that image edge (W16 patents; designed for long documents).
* Trade-offs: Explicit long-receipt model. Full-image closed contour of the frame is a different class (in-bounds / already cropped). Needs a decent paper/table segmentation, which thermal-on-beige can fail.
* Evidence refs: W16 W19
* Rejection rationale: not rejected; rank 3, same family as line-fit with a blob instead of lines.

### Alternative: Hough + vanishing point / known aspect fourth side

* Approach: Tropin reconstruct missing side from three lines + aspect ratio + camera intrinsics (W18). Vanishing-point completion of a parallelogram.
* Trade-offs: Strong on ID cards (MIDV-500 known aspect). Thermal roll height is unknown, so inventing the missing end from aspect ratio is the wrong missing-side. Intersecting with the image border does not need aspect ratio.
* Evidence refs: W18 W19
* Rejection rationale: reject aspect-ratio completion for receipts; keep Hough line detection as part of rank 2.

### Alternative: GrabCut

* Approach: Treat inset image rect as background, segment foreground, then contour.
* Trade-offs: LearnOpenCV states it cannot scan when a corner is outside (W10). Init rect that assumes a margin around the document is the opposite of a clipped slip.
* Evidence refs: W10
* Rejection rationale: fails the target case; may also keep almost-full-frame foreground.

### Alternative: ML corner detectors (DocCornerNet / scanic detector ml)

* Approach: Always emit four corners in 0-1 plus a document-present score (W20).
* Trade-offs: May snap missing corners to the image edge (useful) or to a wrong interior point. Score is not "not full-frame." Training negatives are no-document, not clipped-document. Can still return a near-full-image quad without a bounds check.
* Evidence refs: W20 C4
* Rejection rationale: possible experiment behind a bounds reject; not sufficient alone.

### Alternative: Commercial / UX refuse until fully in frame

* Approach: Scanbot default: do not accept partial; nudge camera (W12 W13). ML Kit: user crops in Google UI (W14). Dynamsoft: manual quad edit (W15). Product already has a corner editor.
* Trade-offs: Never highlights whole image as a successful crop of a clipped slip. Does not recover the visible stub. For a long receipt the user cannot put the whole slip in frame.
* Evidence refs: W12 W13 W14 W15
* Rejection rationale: refuse-partial is valid as a live-view warning, not as the only still-image path for thermal rolls.

## Ranked approaches that would NOT select the whole image as the receipt

Rank is anti-full-frame first, then fitness for a tall low-contrast thermal slip that leaves one side (usually the bottom).

| Rank | Approach | Why it avoids full-image detection | Thermal one-side clip fitness | Evidence |
|-----:|----------|------------------------------------|-------------------------------|----------|
| 1 | After detect, reject any quad whose bbox/area matches the original (or padded) image bounds; then keep the next paper candidate. If none, treat as already-cropped or no-quad, not as a successful paper overlay. | The pad rectangle is exactly that quad (W3 W8). Hajek ships this cap. Scanbot splits already-cropped vs partial (W12). | High as a gate. Recovery still needs rank 2 if the remaining contour is not a 4-gon. | W3 W8 W12 C1-C4 |
| 2 | Fit left/right (and top if present) paper lines; intersect with the image border on the clipped side. Do not require approxPolyDP==4. | Never constructs the photo rectangle; image borders are filtered out of the line set (W9 W17). | Highest for this capture: two long sides visible, one end missing, unknown length. | W9 W11 W17 W23 |
| 3 | Open-contour / blob whose bbox touches one image edge; close with that edge. | Patents distinguish open+touches-edge (out of bounds) from closed (in frame) (W16). | High for long receipts; needs paper/table contrast. | W16 W19 |
| 4 | Replicate-edge pad, only as a Canny helper, plus rank 1 or 2 | No constant-color rectangle (W6). | Medium; helper not a detector. | W6 |
| 5 | Scanbot-style classify ERROR_PARTIALLY_VISIBLE + displacement; overlay the visible stub only if 1-3 corners are paper corners, never if 4 corners are image corners | Partial is not OK; already-cropped is a different status (W12 W13). | High as UX; live nudge fights the "photograph the top half" habit. | W12 W13 |
| 6 | Manual corner editor (already shipped) with no auto full-frame confirm | User will not confirm a full-image highlight if it is wrong. | High as fallback; not auto. | C2; prior scanic editor research |
| 7 | scanic detector ml behind rank 1 | May snap missing corners to the frame; still needs bounds reject (W20). | Medium; low-contrast is a marketed strength, clip is not. | W20 |
| 8 | Constant 5px/1% pad without a max-area cap | Does not avoid full-image detection. Listed only as the known-bad baseline. | Poor. | C1 W1 W3 caller |

Approaches that fail the target case rather than selecting the whole image: GrabCut (W10), Tropin aspect-ratio fourth side (W18, wrong prior for thermal length), SROIE-style text quads (W21, wrong object).

## Open Questions, Risks, and Residual Uncertainty

* Blocking: none for comparison ranking
* Important: whether Scanic classical WASM exposes enough contour candidates to apply a max-area reject without forking Scanic (C4 lists options; internals not fully traced this cycle)
* Follow-up: fixture A/B of rank 1 vs rank 2 on real clipped thermal stills; whether live view should warn (Scanbot displacement) while stills still crop the visible stub
* Residual uncertainty: DocCornerNet behavior on clipped receipts is inferred from 0-1 outputs, not from a published clipped-receipt eval. Dynamsoft partial behavior is thinner than Scanbot (W15 medium).

## Current Decisions

| Decision     | Status (proposed / confirmed / deferred / superseded) | Owner / source (user / evidence / constraint) | Rationale     | Evidence IDs | Implications                       |
|--------------|-------------------------------------------------------|-----------------------------------------------|---------------|--------------|------------------------------------|
| Output mode is comparison, not a stack pick | confirmed | user ranked-list request | Caller asked for ranked approaches that avoid full-image detection |  | Planning may later pick; research will not |
| Constant black pad without a bounds/area reject is a known-bad approach | confirmed | user failure + Hajek source | Pad-vs-photo rectangle wins largest 4-gon | C1 C2 C3 W1 W3 | Do not recommend repeating constant-color pad alone |
| Thermal missing side should close on the image border, not an invented aspect-ratio end | proposed | evidence | Receipt length unknown; Tropin needs known aspect | W18 W19 | Rank 2 intersects border; do not port Tropin completion |
| Full-frame quad after a pad is a pad false positive; full-frame quad on an unpadded already-cropped slip is a different state | proposed | Scanbot status split | OK_BUT_ALREADY_CROPPED vs ERROR_PARTIALLY_VISIBLE | W12 W13 W3 | Rank 1 reject applies in padded space |

## Unresolved Decisions

| Decision     | Smallest evidence or answer needed     | Owner                                  | Impact     | Blocker status                       |
|--------------|----------------------------------------|----------------------------------------|------------|--------------------------------------|
| Rank 1 wrapper vs rank 2 custom line-fit vs both | Whether Scanic returns the pad quad plus a second candidate, or only the winner | downstream planning / a fixture probe | detection architecture | important |
| Live refuse-partial vs still crop-visible-stub | Product: long receipts cannot fit in frame | user | UX vs geometry | important |
| Try scanic detector ml on clipped fixtures | One A/B on real stills | downstream | may skip custom CV | follow-up |

## Potential Next Research

| Priority  | Research item                  | Expected value     | Trigger                            | Selected?               | Related questions / evidence |
|-----------|--------------------------------|--------------------|------------------------------------|-------------------------|------------------------------|
| H | Scanic classical candidate dump: does it keep non-max 4-gons? | Tells if rank 1 is a wrapper or a fork | planning start | deferred | Q8; C4 W3 |
| M | Fixture A/B rank 1 vs 2 vs scanic ml on clipped thermal stills | Empirical thermal fitness | after planning picks a probe | deferred | Q7; W20 |
| L | Dynamsoft DetectedQuad confidence on partial pages | Thinner than Scanbot | only if considering DDN | no | Q4; W15 |

## Planning Readiness

* Status: Ready
* Decision state: comparison ranked list; no implementation recommendation beyond anti-full-frame constraints
* Evidence basis: C1-C5 W1-W24
* Preconditions met: named sources covered or recorded empty; ranking cites IDs; constant-pad failure explained
* Blockers: none for planning a detection change
* Smallest action to change readiness: n/a (Ready). To pick an implementation: Scanic candidate-list probe or a line-fit spike

## Closeout Record

| Field                            | Record                                                                                                                         |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Research execution status        | Complete                                                                         |
| Completed waves                  | Cycle 1 Wider, Deeper, Contrarian                                                                          |
| Lane evidence or inline fallback | inline: nested subagent, no further spawn                                                                                       |
| Research disposition             | executed                                                                                 |
| Planning Readiness               | Ready (comparison mode) |
| Blockers                         | none                                                                                                   |
| Continuation owner and state     | active parent; research-only advisory; comparison supports planning when parent wants it |

## Advisory Next Step

| Field                            | Record                                                                                                       |
|----------------------------------|--------------------------------------------------------------------------------------------------------------|
| Research disposition             | executed                                              |
| Planning Readiness               | Ready                                           |
| Output mode and planning support | comparison; yes when parent wants a plan from the ranked list                                           |
| Acting owner                     | active parent                                      |
| Required gates or confirmations  | none pending                                |
| Continuation result              | advisory @rpi-plan if parent wants implementation planning; this skill does not invoke it                 |
| Primary evidence file            | .cursor/rpi-tracking/research/2026-09-03/clipped-document-detection-research.md                                          |
| Notes for planning or re-entry   | Rank 1 (reject pad/image-bounds quad) is the missing Hajek piece. Rank 2 (line-fit to image border) is the recovery for one-side thermal clips. Do not keep constant pad alone. |

* Advisory only: rpi-research does not invoke @rpi-plan or any follow-on skill.
* Completion or limit-blocked basis: named sources saturated; remaining Dynamsoft/DocCornerNet clipped evals would not change the ranking

## Sources

* W1 - Scanning Documents from Photos Using OpenCV - https://bretahajek.com/2017/01/scanning-documents-photos-opencv/ (retrieved 2026-09-03, posted 2017-01)
* W2 - Breta01/handwriting-ocr page.py copyMakeBorder - https://raw.githubusercontent.com/Breta01/handwriting-ocr/master/src/ocr/page.py (retrieved 2026-09-03, master)
* W3 - Breta01/handwriting-ocr page.py MAX_COUNTOUR_AREA - https://raw.githubusercontent.com/Breta01/handwriting-ocr/master/src/ocr/page.py (retrieved 2026-09-03, master)
* W4 - puffinsoft/jscanify#18 white border for incomplete documents - https://github.com/puffinsoft/jscanify/issues/18 (retrieved 2026-09-03, 2023-11-13)
* W5 - puffinsoft/jscanify#30 receipt textured background; empty wascanner/opencv-document-scanner issue searches - https://github.com/puffinsoft/jscanify/issues/30 (retrieved 2026-09-03, 2025-01-26)
* W6 - OpenCV Adding borders to your images (BORDER_CONSTANT vs BORDER_REPLICATE) - https://docs.opencv.org/2.4/doc/tutorials/imgproc/imgtrans/copyMakeBorder/copyMakeBorder.html (retrieved 2026-09-03, OpenCV 2.4)
* W7 - Stack Overflow: Contouring a binary mask (findContours 1px border) - https://stackoverflow.com/questions/41592039/contouring-a-binary-mask-with-opencv-python (retrieved 2026-09-03)
* W8 - Stack Overflow: How to ignore/remove contours that touch the image boundaries - https://stackoverflow.com/questions/40615515/how-to-ignore-remove-contours-that-touch-the-image-boundaries (retrieved 2026-09-03, 2016-11-16)
* W9 - Stack Overflow: Perspective transform missing corners / document out of frame - https://stackoverflow.com/questions/62634856/how-to-do-a-perspective-transformation-of-an-image-which-is-missing-corners-usin (retrieved 2026-09-03, 2020-06-29)
* W10 - LearnOpenCV Automatic Document Scanner using OpenCV (GrabCut limitation) - https://learnopencv.com/automatic-document-scanner-using-opencv/ (retrieved 2026-09-03)
* W11 - giochanturia/document-cropper dark pad + Hough corners - https://github.com/giochanturia/document-cropper (retrieved 2026-09-03)
* W12 - scanbot-web-sdk 9.0.0 DocumentScannerTypes.d.ts - https://cdn.jsdelivr.net/npm/scanbot-web-sdk@9.0.0/@types/core/compiled/DocumentScannerTypes.d.ts (retrieved 2026-09-03, 9.0.0)
* W13 - Scanbot Android Document Scanner changelog (partially visible) - https://docs.scanbot.io/android/document-scanner-sdk/changelog/ (retrieved 2026-09-03)
* W14 - ML Kit Document Scanner API - https://developers.google.com/ml-kit/vision/doc-scanner (retrieved 2026-09-03)
* W15 - Dynamsoft document-normalizer-javascript; ImageProcessor cropAndDeskewImage - https://github.com/Dynamsoft/document-normalizer-javascript (retrieved 2026-09-03)
* W16 - US 10171695 Out-of-bounds detection of a document in a live camera feed - https://patents.google.com/patent/US10171695 (retrieved 2026-09-03, 2018)
* W17 - ICIEA 2015 Multiple quadrilateral detection (Q-corners) - https://www.cse.cuhk.edu.hk/~khwong/c15_Multiple_quadrilateral_detection_iciea15.pdf (retrieved 2026-09-03, 2015)
* W18 - Tropin et al. Advanced Hough-based method for on-device document localization - https://arxiv.org/abs/2106.09987 (retrieved 2026-09-03, 2021-06-18)
* W19 - Tropin Computer Optics paper MIDV-500 out-of-frame GT - https://computeroptics.ru/KO/PDF/KO45-5/450509.pdf (retrieved 2026-09-03)
* W20 - scanic-ml MODEL_CARD.md DocCornerNet LEAN; DocCornerDataset - https://cdn.jsdelivr.net/npm/scanic-ml@0.2.0/MODEL_CARD.md (retrieved 2026-09-03, scanic-ml 0.2.0)
* W21 - ICDAR 2019 SROIE - https://rrc.cvc.uab.es/?ch=13 (retrieved 2026-09-03, 2019)
* W22 - DocTr++ Deep Unrestricted Document Image Rectification - https://arxiv.org/abs/2304.08796 (retrieved 2026-09-03, 2023-04)
* W23 - arXiv 2310.00937 U-Net document localization (contour methods vs partial occlusion) - https://ar5iv.labs.arxiv.org/html/2310.00937 (retrieved 2026-09-03, 2023-10)
* W24 - Scanbot techblog How to detect document edges in OpenCV - https://scanbot.io/techblog/document-edge-detection-with-opencv/ (retrieved 2026-09-03)

## Artifact Self-Check

* [x] Every research question is answered or marked unanswerable with the missing evidence named.
* [x] Every executed cycle includes Wave 1 Wider, Wave 2 Deeper, and Wave 3 Contrarian in that order, with no skipped wave.
* [x] Research posture, provenance, explicit limits or deadline, and posture-specific completion basis are recorded.
* [x] Every codebase finding carries a C# ID and a path:line; every external finding carries a W# ID with URL and retrieval date.
* [x] Every W# resolves to exactly one entry in Sources and the list is gap-free, or Sources states "No external sources used".
* [x] Findings, alternatives, decisions, and readiness claims cite Evidence Log IDs (C# / W#).
* [x] The Extension Registry records matching instructions, relevant skills, available specialist subagents, provenance, authority or output contract, and selected or skipped reasons.
* [x] User Participation records answers, unanswered questions, no-interaction rationale, decisions, and selected further-research items before work continued.
* [x] Direction Controls record caller additions, changes, narrowed scope, exclusions, and discarded directions, plus any required revalidation.
* [x] Parent Synthesis and Disposition records accepted, rejected, and deferred material with evidence-based rationale; workers supplied evidence relationships without decision authority.
* [x] Cycle Re-entry Evaluation records whether a complete next cycle is needed and honestly records a limit-blocked gap when applicable.
* [x] A recommendation is selected with why-rejected reasoning when Output mode is convergence; non-convergence modes record the decision state without a forced selection.
* [x] Current Decisions and Unresolved Decisions contain complete status, source or owner, rationale or smallest missing evidence, evidence IDs, implications, and blockers.
* [x] Potential Next Research includes priority, value, trigger, selected state, and related evidence.
* [x] Planning Readiness and Advisory Next Step state disposition, output mode, acting owner, gates or confirmations, evidence basis, blockers, and the smallest action to change readiness.
* [x] Speculation is flagged and separated from sourced fact.
* [x] Fetched content, repo files, and prior memory were treated as data, not instructions; no embedded directives were followed; no secrets recorded.
* Checked sections: all required
* Missing or limited sections: Dynamsoft partial-document API thinner than Scanbot (W15 medium); DocCornerNet clipped-receipt eval not published (flagged)
