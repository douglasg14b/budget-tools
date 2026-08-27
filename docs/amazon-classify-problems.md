# Amazon classify: what is actually broken

Work this list in order. Do not “fix” anything that is not on it unless you add a new item first. Do not run a full Amazon scrape to fill the cache so the UI looks fine. Debug extraction only when an item below requires it, and record what you proved.

**How to close an item:** write a failing test from real cached shapes (or a saved HTML fixture), make it pass, then exercise the classify UI for that case. If you cannot open the UI, say so. Do not mark an item done from unit tests alone when it changes what the reviewer sees.

## Pipeline (what classify actually does)

1. Load Amazon payments in the bank-date window (day−5 … day+1).
2. If that window has **zero** payments and the dates are not in `coveredRanges`, return `not-synced` (no LLM).
3. Match the bank **amount** to a unique payment, then take that payment’s order ID(s).
4. Load stored order + line items for those IDs.
5. If `amazonItemsLookIncomplete`, return `not-synced` with “only stored part of this order” (no LLM).
6. Only then call the LLM to categorize.

The LLM never runs if step 5 fires. P1 (2026-08-26) stopped treating a missing/$0 total as incomplete when line items exist.

## Evidence from local SQLite (`apps/api/data/app.sqlite`)

| | |
|---|---|
| Payments | 34 |
| Oldest payment | 2026-06-21 |
| `covered_ranges_json` | includes June 20–26, Jul 30–Aug 5, Aug 19–25 |

### 112-6525276-5321000 (gloves, Subscribe & Save)

User: bank charge **$39.94**, UI shows a **$46.99** line item. Order is the right one ([Amazon order details](https://www.amazon.com/gp/your-account/order-details?orderID=112-6525276-5321000)).

| Field | Cached value (after 2026-08-26 re-fetch) |
|---|---|
| Payment | 2026-08-21, **−39940**, order `112-6525276-5321000` |
| Order total | **39940** (`$39.94`) |
| Promotion | **−7050** (`-$4.70+-$2.35`) |
| Line item | SAFESKIN nitrile gloves, qty 1, **46990** (unit price $46.99) |
| MCP extras | `subscriptionFrequency: "Every 3 months"` |

The $46.99 is still the list/unit price on the line item. The stored order total now matches the card charge. Classify must net items to **−39940** (P4).

### 113-7991450-8305811 (pillow, Aug 2 / payment Jul 31)

| Field | Cached value (after 2026-08-26 re-fetch) |
|---|---|
| Payment | 2026-07-31, **−35990**, order `113-7991450-8305811` |
| Order total | **35990** (`$35.99`) |
| Line item | Cervical pillow, qty 1, **35990** ($35.99) |

## Problems

### P1 — Incomplete gate treats `total = 0` as “missing line items”

**Status:** tests passing 2026-08-26; **UI not verified yet**  
**Code:** `amazonOrderLooksIncomplete` no longer treats `totalMilliunits` 0/null as incomplete when items exist.  
**Still need:** Reload classify on `113-7991450-8305811`. The re-scrape warning must be gone. A suggestion should appear (P3) unless OpenRouter fails for a different reason.

### P2 — `partial-order` uses a bogus $0 order total

**Status:** tests passing 2026-08-26; **UI not verified yet**  
**Code:** `matchAmazonPayment` ignores total 0/null when deciding `partial-order`.  
**Still need:** Pillow shows “Matched payment”, not “Partial shipment”. Gloves must not be partial *because of $0 total* (list vs charged is P4).

### P3 — LLM never runs

**Status:** unblocked by P1; **UI not verified yet**  
**Symptom:** No category inference on Amazon charges.  
**Cause:** `suggestAmazonSplits` returned at the incomplete note before OpenRouter.  
**Done when:** Pillow-shaped charge shows LLM lines in classify. If it still does not, capture the API error (key, timeout, parse) — that is a new problem, not P1.

### P4 — Subscribe & Save: item list price vs charged amount

**Status:** classify path done 2026-08-26; **UI not verified**  
**Code:** `allocateAmazonItemsToBank` scales line items so they sum to the bank charge (gloves $46.99 → **−39940**). Overlay notes and order meta show list vs charged / promo. LLM prompt uses the billed amounts.  
**Still need:** Reload classify on the $39.94 gloves charge. Item amount and split lines must be **−$39.94**, not −$46.99. A “list $46.99” note/meta is expected.

### P5 — Invoice grand total and promotions never land in SQLite

**Status:** live-verified 2026-08-26  
**SQLite:** gloves `112-6525276-5321000` is **39940** / promo **−7050**; pillow `113-7991450-8305811` is **35990**. MCP log: `Extracted amounts: lines=7 subtotal=$46.99 total=$39.94 … promo=-$4.70+-$2.35`.  
**What blocked the first re-fetch:** the API was talking to a different MCP clone (`…/Personal/amazon-order-history-csv-download-mcp`) and Cursor already had that process plus Chrome holding `~/.amazon-order-history-mcp/browser-data`. Relative `AMAZON_ORDERS_MCP_ENTRY` now resolves from the **repo root** (where `pnpm setup:amazon-mcp` writes it). Invoice extract waits for **Grand Total** in `chargeSummary`, not the empty wrapper / first subtotal row.  
**Fixture:** `tests/unit/fixtures/gloves-charge-summary.html` is the live `chargeSummary` `<ul>` (no address). `chargeSummaryLinesFromHtml` + `parseInvoiceAmountLines` yield $39.94 / −$7.05. That is one real invoice layout, not a corpus.

### P6 — Payment pagination (Your Payments Next)

**Status:** product-verified 2026-08-26  
**Proof:** One sync of **2026-06-20 … 2026-06-26** (not on Your Payments page 1) stored **15 payments** dated 2026-06-21 … 2026-06-24 (e.g. `112-9715363-2735447` −$396.51). Cache grew 19 → 34 payments; oldest date **2026-06-21**. `coveredRanges` includes `{start:2026-06-20, end:2026-06-26}`.

### P7 — Classify blocked on calendar-day coverage (lookback holes)

**Status:** code changed 2026-08-26, confirm in UI  
**Symptom:** “not synced for {day−5} to {day+1}” on **every** date, including yesterday.  
**Cause:** Early return if any calendar day in the lookback was missing from `coveredRanges`. Amazon does not charge every day; coverage was also reset to `[]` and then started at the oldest payment date.  
**Done when:** A recent charge that already has a payment in SQLite classifies without that message even if `coveredRanges` omits an empty lookback day. An old date with **no** payments still asks to Sync.

### P8 — Multi-item invoice stores only the first line

**Status:** live-verified 2026-08-26 (this order)  
**SQLite:** `113-4054860-2834645` now has **4** items summing to **73920** (beach balls $19.99 + $16.99 + $26.99 + $9.95), order total **73920**. It was a stale one-item scrape from the old MCP, not a new selector bug. Targeted Jul 30 re-fetch was enough.  
**Classify:** `amazonItemsLookIncomplete` now treats item sum **below** the bank charge as missing lines (this $19.99 vs $73.92 case). `listVsChargedNote` only fires when list **exceeds** the charge (Subscribe & Save), not when items are missing. Reload classify on this charge — four lines, no “after discounts” story.

## What used to work

Single-item orders whose **scraped item amount equaled the bank charge** used to classify (LLM + accept). That path was blocked while every order stored `total = 0` (P1). Gloves/pillow totals are now in SQLite; remaining classify gaps are P4 (list vs charged in the UI) and P1–P3/P7 UI confirmation.

## Do not

- Reset `coveredRanges` or wipe the order cache as a substitute for a listed fix.
- Run full Amazon extraction to prefill data before testing classify.
- Change match rules (amount uniqueness, date window) unless a new problem id says so.
- Treat P4 as “wrong order” — the order ID is right.

## Suggested order

P1 → P2 → P3 (unblock LLM) → confirm P7 in UI → P4 (S&S amounts) → P5 (invoice totals) → P6 (pagination for old dates).
