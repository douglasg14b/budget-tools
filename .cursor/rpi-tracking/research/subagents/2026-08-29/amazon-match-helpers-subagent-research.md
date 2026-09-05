<!-- markdownlint-disable-file -->

# Lane Research: amazon-match-helpers

| Field | Value |
|-------|-------|
| Date | 2026-08-29 |
| Cycle / wave | 1 / Wider |
| Lane | amazon-match-helpers |
| Parent artifact | `.cursor/rpi-tracking/research/2026-08-29/receipt-taking-research.md` |
| This artifact | `.cursor/rpi-tracking/research/subagents/2026-08-29/amazon-match-helpers-subagent-research.md` |
| Posture | balanced |
| Edits | research-only (this file only) |

## Lane inputs

* Topic: Amazon date-window + unique-amount matching, `isAmazonTransaction`, and whether a shared helper already exists or is Amazon-coupled.
* Questions: Q3 window/unique-amount/payee haystack; `isAmazonTransaction` web/API; `allocateAmazonItemsToBank`; import without overlay/scrape; `nameSimilarity` / payee utilities.
* Scope: `apps/api/src/features/amazonClassify`, apps/web classify Amazon helpers, `docs/amazon-classify-sync.md`, `nameSimilarity`.
* Non-goals: OCR, SQLite migrations, OpenRouter.
* Limits: none.

## Actions taken

1. Repo-wide grep for `amazonPaymentDateWindow`, `isAmazonTransaction`, `allocateAmazonItemsToBank`, `nameSimilarity`, `matchAmazonPayment`, `amazonSyncWindow`.
2. Read API match/allocate/isAmazon helpers + tests; web duplicates; docs matching section; `suggestAmazonSplits` orchestration; `nameSimilarity` / `looksLikeImportName` call sites.
3. Traced imports of match helpers vs overlay/MCP/scrape modules.
4. Checked for shared package / barrel exporting these helpers (none).

## Findings

### Q3 — date window, unique milliunits, payee haystack

#### Date window (`amazonPaymentDateWindow`)

* API: `amazonPaymentDateWindow(bankDate)` returns `{ earliestDate: bankDate−5, latestDate: bankDate+1 }` via `addIsoDays` (`apps/api/src/features/amazonClassify/matchAmazonPayment.ts:12-19`).
* Constants are named `DAYS_AFTER_PAYMENT = 5` (subtracted from bank) and `DAYS_BEFORE_PAYMENT = 1` (added to bank) (`matchAmazonPayment.ts:12-18`) — matches doc “bank date −5 … +1”.
* Web mirror: `amazonSyncWindow` returns `{ from: bankDate−5, to: bankDate+1 }` with comment “Keep in sync with `amazonPaymentDateWindow`” (`apps/web/src/components/review/classify/amazonSyncWindow.ts:1-9`). Local `addIsoDays` duplicated in that file (`amazonSyncWindow.ts:12-19`); API uses `apps/api/src/features/amazonOrders/isoDate.ts:12-16`.
* Docs: same window (`docs/amazon-classify-sync.md:10-11`, `:79`, sequence `:27`).
* Call sites: `suggestAmazonSplits` loads payments with the window (`suggestAmazonSplits.ts:45-50`); web sync button uses `amazonSyncWindow` (`useAmazonSplitOverlay.ts:56-59`).
* Tests: web window covered (`apps/web/src/components/review/classify/__tests__/amazonSyncWindow.test.ts:5-8`). **No dedicated unit test** imports/asserts `amazonPaymentDateWindow` itself (API tests cover `matchAmazonPayment` / `amazonWindowNeedsSync` only — `matchAmazonPayment.test.ts`).

**Confidence:** high (window math). Medium that API/web stay in sync long-term (duplicated constants, comment-only contract).

#### Unique milliunits match (`matchAmazonPayment`)

* Pure matcher: filter payments where `Math.abs(payment.amountMilliunits) === Math.abs(bankAmountMilliunits)`; require **exactly one** candidate (`matchAmazonPayment.ts:39-43`). Else `unmatched`.
* Then classifies the unique hit: no order IDs → `unmatched` with payment; multiple order IDs → `batched-orders`; single order with nonzero total ≠ bank abs → `partial-order`; else `kind: 'payment'` (`matchAmazonPayment.ts:50-63`).
* Orchestration also pre-filters window payments by abs amount before match (`suggestAmazonSplits.ts:66-76`).
* Docs: amount uniqueness in window; duplicate amounts → unmatched (`docs/amazon-classify-sync.md:79-82`).
* Tests: unique match, batched, partial, dual-amount unmatched, no-amount unmatched, $0 order total not partial (`matchAmazonPayment.test.ts:17-89`); sync-need helpers (`:91-97`).

**Confidence:** high.

#### Payee haystack (not part of payment amount match)

* Amount matching does **not** use payee strings. Payee “haystack” is only in `isAmazonTransaction`: join non-empty `payeeName` / `importPayeeName` / `importPayeeNameOriginal`, lowercased, then `includes('amazon') || includes('amzn')` (`apps/api/src/features/amazonClassify/isAmazonTransaction.ts:10-16`; web twin identical at `apps/web/src/components/review/classify/isAmazonTransaction.ts:10-16`).
* Gate before Amazon suggest: `if (!isAmazonTransaction(tx))` → 422 (`suggestAmazonSplits.ts:41-43`).

**Confidence:** high.

### `isAmazonTransaction` — web and/or API

| Location | Role |
|----------|------|
| `apps/api/src/features/amazonClassify/isAmazonTransaction.ts:10-16` | API gate + `oldestUncategorizedAmazonDate.ts` import |
| `apps/web/src/components/review/classify/isAmazonTransaction.ts:10-16` | Duplicate; Classify UI / overlay routing |

* Matches substring `amazon` or `amzn` in joined payee fields (comment: not Whole Foods unless AMZN present) (`isAmazonTransaction.ts:7-16` both sides).
* Web uses: skip generic LLM suggest for Amazon (`applyLlmOverlay.ts:13-14`); enable Amazon suggest (`:19-23`); Amazon card overlay props (`ClassifyWorkspace.tsx:152-155`).
* Tests: API (`__tests__/isAmazonTransaction.test.ts:5-28`); web (`web/.../__tests__/isAmazonTransaction.test.ts:5-28`) — Whole Foods false on web; Safeway false on API.
* **Not shared via a package** — two copies, same logic. No `packages/` `nameSimilarity`/Amazon helper.

**Confidence:** high.

### `allocateAmazonItemsToBank` — bank amount as split total

* Scales line items so signed milliunits sum to `bankAmountMilliunits` (`allocateAmazonItemsToBank.ts:8-41`): sign-align via `alignAmountToBank` (`alignAmountToBank.ts:5-9`); if sum already matches, return; else proportional abs shares with remainder on last item (`allocateAmazonItemsToBank.ts:32-40`).
* Used after match to produce billed items for LLM/categorize (`suggestAmazonSplits.ts:124-128`).
* Pattern for gated/equal-share splits: **pro-rata by abs item totals**, bank total as hard sum constraint; not an equal 1/n share unless item abs totals are equal (test: two equal items → equal halves — `allocateAmazonItemsToBank.test.ts:17-27`). Subscribe & Save list→charge netting test (`:6-9`).
* Depends only on `./alignAmountToBank` — no overlay/MCP/repo (`allocateAmazonItemsToBank.ts:1`).

**Confidence:** high for behavior; medium that this is the intended “gated/equal-share” pattern for receipts (PRD cites it as bank-as-split-total reference; equal-share only emerges when weights equal).

### Can receipts import helpers without Amazon overlay/scrape?

| Helper | Runtime deps | Overlay / MCP / scrape? | Amazon coupling |
|--------|--------------|-------------------------|-----------------|
| `isAmazonTransaction` (API) | none | no | name + feature dir only |
| `amazonPaymentDateWindow` | `addIsoDays` from `amazonOrders/isoDate` via same module | no | colocated in `matchAmazonPayment.ts` |
| `matchAmazonPayment` | type-only `AmazonPaymentRecord` / `AmazonOrderRecord`; value `isoDate` helpers | no | types + Amazon payment/order domain |
| `amazonWindowNeedsSync` | `uncoveredIsoDateRanges` + coveredRanges concept | no scrape call | Amazon sync-coverage domain |
| `allocateAmazonItemsToBank` | `alignAmountToBank` only | no | Amazon-named; algorithm generic |
| `suggestAmazonSplits` | MCP, `fetchAmazonOrderInvoices`, overlay repo, OpenRouter, … | **yes** | full Amazon suggest path |

* Importing `matchAmazonPayment.ts` does **not** import `amazonSplitOverlayRepo`, `fetchAmazonOrderInvoices`, or `amazonMcpClient` (those are only in `suggestAmazonSplits.ts:8-11,26` and related).
* There is **no** extracted shared “date-window + unique-amount” module outside `amazonClassify`. Window is duplicated on web as `amazonSyncWindow`. Unique-amount logic is Amazon-payment-shaped (`AmazonPaymentRecord` fields).
* PRD still marks shared helper as **Not done** (`docs/prds/receipt-taking.md:127`).

**Confidence:** high that pure helpers can be imported without overlay/scrape modules; high that they are Amazon-coupled by location/types/naming (not a neutral shared package today).

### `nameSimilarity` / payee matching utilities

* `nameSimilarity` = Ratcliff–Obershelp via talisman (`apps/api/src/features/categorization/nameSimilarity.ts:1-7`).
* Used by: `listSimilarFinalizedTransactions` / `pickSimilarTransactions` (injected), `looksLikeImportName` / `isSamePayee` / `isDirtierThanCurrent` (`looksLikeImportName.ts:14-59`) for LLM payee hygiene — **not** Amazon payment matching.
* Amazon payee detection is substring haystack (`isAmazonTransaction`), not `nameSimilarity`.
* No dedicated `nameSimilarity.test.ts` found; coverage via `pickSimilarTransactions.test.ts` with mocked scorer.

**Confidence:** high.

### Shared helper already exists?

* **Pieces exist**, Amazon-owned:
  1. Date window: `amazonPaymentDateWindow` (+ web `amazonSyncWindow` duplicate).
  2. Unique abs milliunits among a payment list: `matchAmazonPayment` (+ orchestration pre-filter).
  3. Amazon payee gate: duplicated `isAmazonTransaction`.
  4. Bank-total allocation: `allocateAmazonItemsToBank`.
* **No** cross-feature shared date-window+unique-amount helper for receipts vs Amazon payments today (PRD checkbox not done). Amount uniqueness is generic math; API surface is Amazon payment/order typed.

**Confidence:** high.

## Evidence index (question → claim → path:line)

| Q | Claim | Evidence |
|---|-------|----------|
| Q3 window | bank −5 … +1 | `matchAmazonPayment.ts:12-19`; `amazon-classify-sync.md:79`; `amazonSyncWindow.ts:5-8` |
| Q3 unique $ | unique abs milliunits among candidates | `matchAmazonPayment.ts:39-43`; `matchAmazonPayment.test.ts:71-78`; `amazon-classify-sync.md:80` |
| Q3 payee haystack | substring join of three payee fields for Amazon detect only | `isAmazonTransaction.ts:10-16` (API & web) |
| Q3 match kinds | payment / batched / partial / unmatched | `matchAmazonPayment.ts:4-10,50-63` |
| isAmazon | API + web duplicates; amazon\|amzn | API/web `isAmazonTransaction.ts:10-16`; tests both `__tests__` |
| isAmazon web use | gates LLM vs Amazon overlay | `applyLlmOverlay.ts:13-23`; `ClassifyWorkspace.tsx:152-155` |
| allocate | bank sum constraint + pro-rata | `allocateAmazonItemsToBank.ts:8-41`; tests `:6-27`; call `suggestAmazonSplits.ts:128` |
| import w/o scrape | match/allocate/isAmazon free of MCP/overlay imports | `matchAmazonPayment.ts:1-2`; `allocateAmazonItemsToBank.ts:1`; contrast `suggestAmazonSplits.ts:8-11,26` |
| shared helper? | Amazon-coupled pieces; PRD shared helper not done | this lane; `receipt-taking.md:127` |
| nameSimilarity | categorization/LLM payee only; unused by Amazon match | `nameSimilarity.ts:6-7`; `looksLikeImportName.ts:1,23-59`; no amazonClassify imports |

## Gaps

1. **No API unit test** asserting `amazonPaymentDateWindow` output directly (only web `amazonSyncWindow` test + docs).
2. **Duplication drift risk**: API window vs web `amazonSyncWindow` vs `isoDate.addIsoDays` vs web-local `addIsoDays` — not a single module.
3. **Whole Foods / false-positive edge cases** for `isAmazonTransaction` not exhaustively tested beyond Whole Foods / Safeway / Walmart negatives.
4. Whether receipts should **call** these Amazon-named functions vs copy the math is a **parent decision** (out of lane).
5. Equal-share vs weighted pro-rata intent for non-Amazon receipt splits not specified in code beyond Amazon allocate behavior.

## Stop decision

Lane questions answered with path:line evidence under balanced posture. Remaining items are parent synthesis (reuse vs extract vs duplicate) or out-of-scope. **Stop** Wider work for this lane; no further sources required for the listed questions.
