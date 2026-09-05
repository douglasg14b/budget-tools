<!-- markdownlint-disable-file -->
# RPI Plan Critique: Client Scanic receipt prep

## Metadata

* Task ID: RCS-20260901
* Critique date: 2026-09-01
* Plan: .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md
* Phase details: .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md
* Critique execution status: Complete

## Inputs and Criterion Boundary

* Task context and caller requirements: Client-side Scanic geometry with warped preview before attach; API stores original and processed as distinct artifacts; extract/vision still caps at 1280 via prepReceiptImage; one photo per receipt; overlapping-tape stitch out; frames[] API retained; WASM/canvas OK for solo use; silent WASM-to-JS fallback not OK; no Node scanic/jsdom/canvas; no multipart; no PRD rewrite; locked test ownership (P01 max 1 new test file preferring extends; P02 max 2 new test files; removals none; TSOA+web-sdk in P01).
* Research and evidence considered: .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md (W42 silent WASM fallback, scanic browser API); docs/prds/receipt-taking.md (prep before read, original saved, replay — cite only); apps/web/src/components/review/classify/useReceiptCapture.ts; apps/web/src/components/review/classify/ClassifyReceiptCapture.tsx; apps/web/src/components/review/classify/useReceiptOverlay.ts; apps/web/src/components/review/classify/practiceReceipts.ts; apps/web/src/components/review/receipts/ReceiptsInbox.tsx; apps/api/src/features/receipts/pipeline/prepReceiptImage.ts; apps/api/src/features/receipts/createReceipt.ts; apps/api/src/features/receipts/data/receiptsRepo.ts; apps/api/src/features/receipts/extractStoredReceipt.ts; apps/api/src/features/receipts/extractPreview.ts; apps/api/src/features/receipts/receiptsController.ts; apps/api/src/features/receipts/receiptsDtos.ts; apps/api/src/environment.ts (RECEIPTS_JSON_BODY_LIMIT).
* Decisions, dependencies, and acceptance criteria considered: Plan User Decisions and Requirements; Goals G1–G4; Functional and Non-Functional Requirements; Acceptance Criteria; Test Ownership lock; P01 (persist/serve processed, extract branch, TSOA/SDK); P02 (Scanic wrapper, capture UI, attach/thumbs/oversize); dependencies (pnpm scanic on web, prepReceiptImage 1280, 15 MiB JSON limit).
* Assessment boundary: Credibility of the plan and phase details against supplied caller locks, research, PRD citations, and listed code evidence. Does not open-web research, does not edit plan sources, does not treat unbuilt replay/re-extract APIs as existing, and does not reopen confirmed user direction (client Scanic, stitch out, 1280 on extract only, loud WASM miss, distinct original/processed artifacts).

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| G1 Scanic preview before attach | Covered | P02-T01/T02; useReceiptCapture and ClassifyReceiptCapture are named targets |
| G2 Original and processed stored separately | Partial | P01-T01 sibling file and hash-on-originals are sound; replay vs extract-prefers-processed tension undocumented (PC-004) |
| G3 Geometry in apps/web only | Covered | Explicit non-goals; API targets exclude scanic/canvas/jsdom |
| G4 Loud WASM miss and oversize | Partial | P02-T01/T03 name loud failure; client limit source unspecified (PC-005); WASM probe method deferred (PC-007 residual) |
| FR overlay/inbox thumbs use processed | Partial | Live GET path named in P02-T03; Practice session model has no processed field (PC-001) |
| FR practice extract-preview uses processed | Partial | P01-T02 and P02-T03 intent clear; DTO field name/shape not locked in P01-T03 (PC-003) |
| NFR 1280 extract cap | Covered | prepReceiptImage RECEIPT_PREP_MAX_WIDTH 1280; P01-T02 passes single processed buffer |
| NFR 15 MiB JSON body | Partial | API RECEIPTS_JSON_BODY_LIMIT exists; web has no matching constant (PC-005) |
| Research W42 silent WASM fallback | Covered | P02-T01 loud gate; P02 unresolved probe acknowledged |
| P01 persist and GET processed | Partial | Sibling .processed filename intent in details; GET query contract unspecified (PC-002) |
| P01 extract prefers processed | Covered | extractStoredReceipt and extractPreview branching described; legacy stitch preserved |
| P01 TSOA/SDK | Partial | P01-T03 lists targets; processed GET query must be fixed before generation (PC-002) |
| P02 single-photo capture | Partial | Draft model change in P02-T02; file input still multiple in ClassifyReceiptCapture (PC-006) |
| P02 attach payload | Partial | Live create processed field named; PracticeReceipt persistence for thumb not named (PC-001) |
| Locked test ownership | Covered | Plan table is explicit; findings do not request extra files beyond lock |
| PRD replay against original (cite) | Partial | User decision preserves original for replay; no extract bypass when processed exists (PC-004) |
| Stitch / multipart non-goals | Covered | Explicitly out; frames[] compat retained |

## Verdict

* Verdict: Revise
* Rationale: The plan is well-scoped, honors the client-Scanic pivot and loud-failure locks, and the P01-before-P02 API split is credible. It is not implementation-ready without planner corrections for Practice thumb storage, the GET-processed OpenAPI contract, and a locked ExtractPreview processed field — all of which touch named acceptance criteria and P01 SDK generation. Remaining items (replay contract, client body-limit source, single-file picker) are smaller but should be pinned in the same revision pass.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Practice session thumbs have no processed artifact

* Related IDs: G2; FR overlay/inbox thumbs; Acceptance Criteria (overlay/inbox thumbs prefer processed); P02-T03; apps/web/src/components/review/classify/practiceReceipts.ts; apps/web/src/components/review/classify/useReceiptOverlay.ts; apps/web/src/components/review/receipts/ReceiptsInbox.tsx
* Evidence: Plan P02-T03 says overlay and inbox should prefer processed when hasProcessed. Live paths use GET /api/receipts/{id}/image (useReceiptOverlay, ReceiptsInbox slipFromDto). Practice paths use PracticeReceipt.frames[0] data URLs (useReceiptOverlay imageSrc branch; slipFromPractice). practiceReceiptFromExtract stores only the frames argument passed from attach — today the originals from useReceiptCapture. PracticeReceipt has no processedPreview or hasProcessed field. Phase details P02-T03 likely targets list useReceiptOverlay and ReceiptsInbox but not practiceReceipts.ts or PracticeReceipt type.
* Concern: After attach, Practice classify overlay and inbox will still show the uncropped table photo even though extract-preview ran on the Scanic JPEG. Live thumbs can be fixed with hasProcessed plus GET processed; Practice has no server row and no planned session field for the warped preview.
* Impact: Violates the stated acceptance criterion that overlay/inbox thumbs show warped paper, not background, for both Live and Practice flows exercised in P02 browser verification.
* Smallest useful change: In P02-T03 (and practiceReceipts.ts in likely targets), extend PracticeReceipt with a processedPreview data URL (or equivalent), set it in practiceReceiptFromExtract from the attach payload, and point overlay/inbox Practice imageSrc at that field when present. Keep frames[] as originals only for match-preview fidelity if needed.
* Action owner: planning_parent
* Exact resolving evidence: Phase details name practiceReceipts.ts and PracticeReceipt in P02-T03 targets; completion evidence includes a test or browser check that Practice inbox/overlay thumb shows the Scanic warp, not frames[0] original.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: GET processed image query contract is unspecified before SDK generation

* Related IDs: P01-T01; P01-T03; FR overlay/inbox thumbs; G2; apps/api/src/features/receipts/receiptsController.ts
* Evidence: receiptsController getReceiptImage accepts only numeric frame query (default 0) and always calls readReceiptOriginalBytes. Plan and P01-T01 say GET can return processed and DTO exposes hasProcessed. P01-T03 depends on stable field names for OpenAPI and packages/web-sdk. Phase details mention a .processed sibling filename on disk but do not define the HTTP query (for example processed=true, variant=processed, or a separate route). P02-T03 expects clients to request processed when hasProcessed without a specified URL shape.
* Concern: TSOA generation in P01-T03 cannot produce a typed SDK method if the processed fetch contract is left to implementer guesswork. Divergent choices break P02 thumb wiring and regress Live overlay URLs.
* Impact: Blocks clean P01 completion and forces an extra undocumented SDK regen or ad hoc fetch strings in P02.
* Smallest useful change: Lock one contract in P01-T01/T03 — recommended: extend GET {id}/image with an enum query such as variant=original|processed (default original) or a boolean processed flag — and document the client URL pattern P02-T03 must use when hasProcessed is true.
* Action owner: planning_parent
* Exact resolving evidence: Phase details and generated OpenAPI show the chosen query or route; ReceiptDto.hasProcessed documents which URL to call; P01 tests cover GET processed 200/404.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: ExtractPreview processed input shape deferred across phases

* Related IDs: P01-T02; P01-T03; P02-T03; FR practice extract-preview; apps/api/src/features/receipts/receiptsDtos.ts; apps/api/src/features/receipts/extractPreview.ts
* Evidence: ExtractPreviewDto today is frames[] only. P01-T02 says preview with processed ignores extra original frames for vision input. P02-T03 leaves body.processed versus frames=[processed] unresolved per P01 DTO. P01-T03 owns DTO fields but does not commit to optional processed on ExtractPreviewDto versus overloading frames.
* Concern: P02 cannot type attach mutations until P01 picks one shape. Overloading frames with the processed JPEG risks losing originals in the preview body; a distinct processed field matches CreateReceiptDto and keeps originals in frames for audit/hash semantics.
* Impact: Integration friction between P01 and P02 and ambiguous tests for preview with both originals and processed present.
* Smallest useful change: In P01-T03, add optional processed: string to ExtractPreviewDto and CreateReceiptDto (parallel fields), and state in P01-T02 that extractPreview uses processed when set else legacy frames stitch.
* Action owner: planning_parent
* Exact resolving evidence: receiptsDtos.ts and generated web-sdk types show processed on both create and extract-preview; extractPreview.test.ts covers processed-present ignores extra frames.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: Replay-from-original decision lacks extract bypass contract

* Related IDs: User Decisions (replay re-runs against original); G2; P01-T02; docs/prds/receipt-taking.md (Replay AC); apps/api/src/features/receipts/extractStoredReceipt.ts
* Evidence: Caller/plan user decision: Live stores original at capture size; replay re-runs against that original. P01-T02: extractStoredReceipt and extractPreview prefer stored or body processed when present, then prepReceiptImage. extractStoredReceipt currently reads readReceiptAllFrameBytes only; no replay or re-extract API exists. PRD Replay AC (not done) expects a later extract upgrade to re-run against the saved original.
* Concern: Once processed is persisted, every extractStoredReceipt invocation — including pending sweep after restart — will use the frozen Scanic JPEG, not the original. That satisfies day-one extract but leaves no documented path for a future replay that re-prep from originals (or re-geometry) without a new flag or endpoint.
* Impact: Does not block initial implementation, but the stated user decision and PRD replay intent are silently contradicted unless explicitly deferred with a follow-up contract.
* Smallest useful change: Add a Follow-Up or P01-T02 note: initial and pending extract use processed when present; replay/re-extract from originals is a later task requiring an explicit extract source parameter or temporary absence of processed. Do not imply today's extract path satisfies PRD Replay.
* Action owner: planning_parent
* Exact resolving evidence: Plan Follow-Up Items or P01-T02 boundaries name replay as out of scope with the processed-preference rule for all current extract entry points.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-003 [Medium]: Client oversize gate has no shared 15 MiB limit source

* Related IDs: NFR combined JSON within RECEIPTS_JSON_BODY_LIMIT; P02-T03; G4; apps/api/src/environment.ts
* Evidence: RECEIPTS_JSON_BODY_LIMIT defaults to 15 MiB in apps/api/src/environment.ts. Plan requires client-side refusal before POST when original plus processed data URLs would exceed the limit, with no silent downsample. Grep shows no RECEIPTS_JSON_BODY_LIMIT or equivalent constant in apps/web. P02-T03 says use the known limit same default as API but does not name a shared package or hardcoded byte value.
* Concern: Implementers may guess wrong (10 MiB, 16 MiB), omit the check, or duplicate a magic number that drifts from API env overrides.
* Impact: Loud-failure NFR weakens for file uploads; user sees 413 only after upload attempt or mis-sized client block.
* Smallest useful change: Pin in P02-T03 one source: shared constant in packages (re-export API default) or documented 15728640 bytes matching the API default, with a sentence that custom RECEIPTS_JSON_BODY_LIMIT env on API without client deploy is an accepted ops mismatch (or add the constant to a shared config package in P01 if already touching SDK).
* Action owner: planning_parent
* Exact resolving evidence: useReceiptCapture or attach helper tests assert block before mutate when JSON.stringify body length exceeds the named constant; error copy is user-visible.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-006 -->
### PC-006 [Low]: Single-photo file picker not pinned in capture tasks

* Related IDs: G1; P02-T02; User Decisions (one photo); apps/web/src/components/review/classify/ClassifyReceiptCapture.tsx
* Evidence: Plan locks one photo per receipt and reshoot replaces. ClassifyReceiptCapture file input has multiple attribute and pickFiles can append up to MAX_RECEIPT_FRAMES. P02-T02 replaces draft with one original plus preview but does not list removing multiple or capping pickFiles to one file.
* Concern: Residual multi-file UX conflicts with single-photo intent unless explicitly removed.
* Impact: Low; likely caught in P02 browser check but avoidable ambiguity.
* Smallest useful change: In P02-T02 boundaries, set file input to single file and pickFiles replaces draft instead of appending.
* Action owner: planning_parent
* Exact resolving evidence: ClassifyReceiptCapture accepts one file; useReceiptCapture tests cover replace-on-second-pick.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-007 -->
### PC-007 [Low]: WASM presence probe remains implementer-defined

* Related IDs: P02; P02-T01; Research W42; G4
* Evidence: Phase details P02 and P02-T01 unresolved items: if scanic exposes no WASM-loaded flag, wrapper must probe initialization and fail loud rather than continue on JS fallback. Plan accepts this deferral with guidance aligned to root-cause-over-workarounds.
* Concern: Probe brittleness could ship a false negative (block capture) or false positive (allow JS path) if not validated in wrapper tests.
* Impact: Residual implementation risk; mitigated by P02 unit tests for WASM miss and browser verification.
* Smallest useful change: Optional: add one line to P02-T01 validation naming the chosen probe (for example post-initialize engine check) as completion evidence in the changes log. Not required to unblock plan if wrapper tests enforce no attach on miss.
* Action owner: implementer
* Exact resolving evidence: Wrapper tests pass for forced WASM miss; browser check with WASM disabled shows error and no attach.
* Decision route: direct planner correction (optional note only)

## Strengths and Residual Risk

* P01-before-P02 ordering is correct: SDK and persistence land before capture depends on processed fields.
* Distinct original versus processed storage avoids treating Scanic output as an extra frames[] original — aligned with createReceipt extraFrames semantics and contentHashOfFrames on originals only.
* Loud-failure posture for WASM miss, no-quad without manual confirm, and oversize JSON matches repository rules and research W42.
* Legacy rows without processed keep today stitch path; prepReceiptImage 1280 tests explicitly stay untouched.
* Locked test ownership is realistic and colocated with named targets.
* Residual risk (accepted if not revised): large file-upload pairs may routinely hit 15 MiB (plan Follow-Up); 180 OSD and thermal curl remain deferred; Scanic Vite/WASM bundling relies on P02 browser verification rather than a dedicated config task.

## Questions or Blocking Evidence Gaps

* None blocking. Replay semantics and WASM probe are documentable without new research. No open-web or fixture A/B required for this critique boundary.

## Limitations

* docs/prds/receipt-taking.md cited for replay and prep intent only; full PRD not re-audited.
* Delegated 2026-08-31 subagent research lanes not independently re-read; primary research artifact is the evidence of record.
* No live scanic install, Vite bundle, or browser WASM smoke in this critique pass.
* Codebase read limited to caller-listed paths; no exhaustive grep of all receipt consumers.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: planning_parent
* Smallest next action: Revise phase details P02-T03 (and practiceReceipts.ts targets) to store and display a Practice processed preview URL; lock GET processed query and ExtractPreviewDto.processed in P01-T03 before implementation.
* User response required: no

| Artifact | Description |
|----------|-------------|
| .cursor/rpi-tracking/plans/2026-09-01/receipt-client-scanic-plan.md | Plan under critique |
| .cursor/rpi-tracking/details/2026-09-01/receipt-client-scanic-phase-details.md | Phase details under critique |
| .cursor/rpi-tracking/research/2026-08-31/receipt-image-prep-research.md | Scanic/WASM and geometry research |
| .cursor/rpi-tracking/reviews/plans/2026-09-01/receipt-client-scanic-plan-critique.md | This critique record |

## Next Steps

Planning parent should apply the PC-001 through PC-005 planner corrections to the plan and phase details, then proceed to @rpi-implement on P01 when the revised plan is credible. No user decision is required unless the parent chooses to reopen replay scope now rather than defer it per PC-004.
