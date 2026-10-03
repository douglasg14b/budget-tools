---
title: Migrate Amazon order scraping to the amazon-orders library
status: proposed
created: 2026-09-14
---

# Migrate Amazon order scraping to `amazon-orders`

## Why

Amazon sync does not run in production. `AMAZON_ORDERS_MCP_ENTRY` is deliberately
unset (`docker-compose-prod.yml:60-61`) because the vendored MCP needs a *headed*
Chromium that no image can run.

A spike on 2026-09-14 established that `amazon-orders` 4.6.0 scrapes order history
and transactions from a **pure-HTTP session with no browser installed**, provided it
is given a warm cookie jar. The browser is only needed to mint that jar, and that
can happen on the desktop.

Verified in the spike (134 orders, 89 transactions, 2026):

| Question | Result |
|---|---|
| Warm HTTP-only, no Playwright | **PASS** — zero challenges, zero prompts |
| Issue #124 (multi-item shipments omitted) | **PASS** — fixed in 4.5.0; the GitHub issue is stale |
| Pagination | 134 orders, 134 unique, no duplicates, natural month taper |
| Per-item prices | 0 items missing a price |

It also fixes a defect we have open. `docs/amazon-classify-problems.md` records
"$0 order totals"; the spike reproduced it (`Order.grand_total == 0.0` on a real
order) and showed `AmazonTransactions` reports the true charged amount —
`subtotal 125.64 + estimated_tax 10.53 = 136.17`, matching the transaction exactly.

## The working spike (how to do this TODAY, before Phase 3 exists)

The spike lives in `.spike/` (gitignored — it holds a venv and real order data). It
is the manual version of the Phase 3 command, and the reference implementation for
Phase 1. **Two venvs, deliberately separate:**

| Venv | Contents | Purpose |
|---|---|---|
| `.spike/.venv-browser` | `amazon-orders[browser]` + Chromium | Stage 1: mint the jar |
| `.spike/.venv` | `amazon-orders` only, **no Playwright** | Stage 2: prove HTTP-only works |

```powershell
# Stage 1 - mint a cookie jar (prompts: email, password, SMS code)
.spike\.venv-browser\Scripts\python.exe .spike\stage1_login_with_browser.py

# Stage 2 - verify the warm jar works with no browser
.spike\.venv\Scripts\python.exe .spike\stage2_warm_http_only.py
```

Jar lands at `.spike/out/cookies.json`. Stage 2 refuses to run if Playwright is
importable, because its presence would invalidate the result.

### The gotcha that cost three failed runs

**Installing `amazon-orders[browser]` does NOT enable browser challenge handling.**
The default auth chain (`session.py:159-173`) is hardcoded and ends in
`AcicAuthBlocker` + `JSAuthBlocker`, which exist *only* to raise "install the browser
extra". The extra merely makes the solvers importable. They must be registered
explicitly:

```python
auth_forms_classes = [
    "amazonorders.contrib.browser.playwright.PlaywrightJSAuthForm",
    "amazonorders.contrib.browser.playwright.PlaywrightAcicForm",
]
```

They are injected *before* the blocker pair in `AmazonSession.__init__`
(`session.py:83-107`), so the real chain is only visible on a **constructed session**
(`session.auth_forms`) — `default_auth_forms()` returns the hardcoded list and will
mislead you. Stage 1 asserts a Playwright form is present before spending a login.

Do **not** register `PlaywrightManualWafForm` speculatively: it is for AWS WAF visual
puzzles, and it opened a visible browser window on plain amazon.com with nothing to
solve. `PlaywrightJSAuthForm` runs headless and handles the challenge we actually hit.

A cold, cookieless login over pure HTTP **always** fails with `JSAuthBlocker`
(`forms.py:499`) — Amazon serves the JS challenge *before* credentials are submitted.
This is expected, not a misconfiguration.

## Spike evidence (raw numbers, 2026 orders)

Kept because later phases are justified by these and `.spike/` is disposable.

- **134 orders, 134 unique**, no duplicates. Month taper: Jan 16, Feb 10, Mar 12,
  Apr 17, May 15, Jun 18, Jul 25, Aug 13, Sep 8 — natural, not a truncated round number.
- **Multi-item shipments parsed correctly**, including a 5-item soldering order
  (Hakko stand, solder wire, flush cutters, Pinecil, tweezers) and a 2-item order.
  0 items missing a price. This is the direct refutation of issue #124.
- **89 transactions, 66 matched to orders.** The 23 unmatched all have blank
  `order_number` and are digital subscriptions (`Amazon Kids+` at $5.99/mo,
  `D01-*` prefixes) — not missing data. This is where the Phase 6 figure comes from.
- **4 "mismatches", all explainable:**
  - Split shipments: order `113-5965822-2301821` charged $86.15 + $33.99 = **$120.14
    exactly**, matching the order total. Amazon charges per shipment.
  - `$0 grand_total`: order `111-4826676-5544239` reported `grand_total: 0.0` but
    `subtotal 125.64 + estimated_tax 10.53 = 136.17` = the transaction exactly.
- **Cookie jar: 14 cookies**, all five auth-bearing names present (`x-main`,
  `at-main`, `sess-at-main`, `ubid-main`, `session-id`), plus an `aws-waf-token` —
  the challenge solution the headless browser earned and harvested back. That token
  may be load-bearing for the warm session; preserve the whole jar, not a subset.

## Verification log

What has and has not been proven, so nobody mistakes the plan for tested.

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | Desktop headless login mints a usable jar | **Proven** 2026-09-14 | Stage 1; 14 cookies incl. all auth-bearing names |
| 2 | Warm jar drives pure HTTP, no browser installed | **Proven** 2026-09-14 | Stage 2; 134 orders / 89 transactions, zero prompts |
| 3 | Jar survives time | **Proven ≥19 days** 2026-10-03 | Same jar, untouched, re-ran stage 2: 145 orders / 94 transactions |
| 4 | Desktop-minted jar works from a Linux container (no browser) | **Proven** 2026-10-03 | `.spike/container/Dockerfile`, python:3.12-slim, 167 MB, no Playwright/Chromium. Identical to desktop: same 145 order numbers, 0 differing totals/item counts |
| 5 | Library data fits the existing parser/splitter | **Proven offline** 2026-10-03 | Field mapping table in Phase 1; Σ price×qty = subtotal on 130/130 |
| 6 | Jar works on the Coolify host / production IP | **Not tested — accepted risk** | Decided 2026-10-03 to let the first real deploy be the test. Likely fine (home-lan host, probably the desktop's public IP), but an IP mismatch would only surface after Phases 1-7 are built |
| 7 | Refresh command pushes a jar to production | **Not built** | Phase 3 |
| 8 | Per-order `get_order(order_id)` (the API's actual call pattern) works | **Proven** 2026-10-03 | Spike used bulk `get_order_history`; this is a separate code path. `111-4826676-5544239`: 7 items, subtotal 125.64, tax 10.53, `full_details=True`; `113-5130017-1225037`: qty 3 × 7.59, promo −1.14, total 21.63 |
| 9 | Expired-jar failure mode | **Unobserved** | Only cold-no-jar (`JSAuthBlocker`) and warm-jar (works) have been seen. A stale jar likely hits `check_response()` → `AmazonOrdersAuthRedirectError` + `logout()` before any blocker. Phase 1 must catch **both** `AmazonOrdersAuthRedirectError` and `AmazonOrdersAuthError` as `COOKIES_EXPIRED`, and snapshot the jar before `login()` |

Notes from #8: `Item.quantity` is `None` for single-quantity items (the parser
already defaults to 1), and discount fields come back **negative** (`promotion_applied
= -1.14`); `grand_total = subtotal + promotion`. Use the absolute value when summing
discounts for the `$0 grand_total` fallback.

To repeat #4 locally (Git Bash needs `MSYS_NO_PATHCONV=1` or it rewrites `/out`
into a Windows path and the container never finds the jar):

```bash
docker build -t amazon-orders-spike -f .spike/container/Dockerfile .spike
mkdir -p .spike/out-container && cp .spike/out/cookies.json .spike/out-container/
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/.spike/out-container:/out" \
  -e SPIKE_OUT_DIR=/out amazon-orders-spike
```

## Options considered and rejected

Recorded so they are not re-litigated.

- **noVNC sidecar** (Xvfb + x11vnc + noVNC beside the API, human logs in via a web
  page). Was the leading option until the warm-jar spike passed. Needs `shm_size: 2g`,
  a browser in the image, and a profile volume. Superseded — keep as the fallback if
  the cookie-jar approach proves unreliable.
- **Seed cookies from the desktop Chrome profile.** Mechanically possible
  (`cookie_jar_path` accepts any JSON dict) but risks a TLS/JA3 fingerprint mismatch
  against cookies minted by Chrome. Superseded by minting them with the *same stack*
  that later presents them, which sidesteps the mismatch entirely.
- **Email parsing.** Dead: Amazon stripped item details from order emails on
  2026-07-08. Subject went from `Ordered: "Bounty Essentials..."` to
  `Ordered: 1 Essentials item`. Order total only, no line items.
- **Amazon Business account.** Has line-item reconciliation reports, but existing
  order history does not migrate and the API needs enterprise registration.
- **Third-party APIs** (Knot, Zinc, Plaid). Either enterprise sales-gated, or they
  want your Amazon password — strictly worse than a local scraper.
- **Patchright instead of vanilla Playwright.** Recommended during research to hide
  `window.__playwright__binding__` and the `Runtime.enable` artifact. Moot now: the
  browser only runs on the desktop for a few seconds during login, and the server
  runs no browser at all. Revisit only if login starts getting challenged.

## Decisions

- **Full swap.** The library replaces the vendored MCP; `third_party/` clone, the
  1005-line patch, and `scripts/setup-amazon-mcp.mjs` are retired.
- **Own container** (`apps/amazon-sync`), following the `transactions-retrieval`
  idle-container + `docker exec` cron pattern.
- **Cookie delivery: both paths.** A repo command that mints and delivers the jar
  end-to-end, plus a web UI upload as fallback. The stated requirement is *not
  having to remember the process*.
- Digital subscriptions, expiry detection, compose-comment fixes, and a scheduled
  sync are all in scope.

## Correction to an earlier concern

`paginationComplete` was flagged as a blocker. It is not.
`coveredRangeFromScrapedPayments` (`isoDate.ts:80-97`) returns the whole requested
range when the flag is true, and only falls back to a newest-first partial walk when
false. `amazon-orders` pages exhaustively (`keep_paging=True`) or raises, so the
adapter can return `true` honestly. The partial branch stays as an unused safety net.
**No rework needed** — only a comment explaining why the flag is now always true.

## Architecture

```
Desktop (occasional)                 S3                 Server (continuous)
────────────────────                 ──                 ───────────────────
pnpm amazon:refresh-cookies   ──►  amazon-session  ◄──  amazon-sync container (HTTP :4022)
  └ Playwright + [browser] extra     bucket               └ amazon-orders, NO browser
  └ solves JS challenge                                    └ reads jar from S3 per call
  └ verifies, then uploads jar                             └ returns MCP-compatible JSON
                                                                    ▲
                                                 api ── HTTP ───────┘  (AMAZON_SYNC_URL)
                                                  └ in-process scheduler triggers sync
```

**Correction (2026-10-03).** An earlier draft had the API *spawn* the Python
process. That cannot work once Python lives in its own container: one container
cannot start a process in another. The API already solves this for the scorer —
`CATEGORIZATION_SCORER_URL: http://scorer:4021` (`docker-compose-prod.yml:39`,
`environment.ts:91-94`), optional, with behaviour falling back when unset. The Amazon
service follows the same pattern: `AMAZON_SYNC_URL: http://amazon-sync:4022`. Unset
means Amazon endpoints return 503, which is today's behaviour.

The API keeps its existing seam. `AmazonOrdersSource`
(`amazonOrdersSource.ts:4-8`) is three methods; only the implementation behind it
changes. The Python service returns the **same JSON payload shapes** the current
`parseAmazonMcp.ts` already validates, so the parse layer survives nearly intact.

## Phases

### Phase 1 — Python sync service

New `apps/amazon-sync/`, a small internal HTTP service (not a CLI — see the
Architecture correction).

- Three endpoints mirroring the source interface: `GET /auth`,
  `GET /transactions?start=&end=`, `GET /orders/{orderId}`, plus `GET /health` for
  the compose healthcheck. Internal network only; not published.
- **One request at a time, enforced in Python.** The old client serialised calls in
  TS (`toolChain`, `amazonMcpClient.ts:88-94`). The Python service owns the session
  and cookie jar now, so it holds the lock: concurrent requests would race the jar.
- Output shapes match `parseAmazonMcp.ts` exactly: `{ authenticated, username,
  message, loginUrl }`, `{ transactions[], paginationComplete }`,
  and `{ order: { id, date, total, shipping, tax, promotion }, items[] }`.
- **Field mapping (verified 2026-10-03 against spike data):**

  | Parser expects | Emit from library |
  |---|---|
  | payment `date` | `Transaction.completed_date` |
  | payment `amount` | `Transaction.grand_total` **as-is** (see sign note) |
  | payment `orderIds[]` | `[order_number]`, or `[]` when blank (digital) |
  | payment `cardInfo` | `payment_method_last_4` |
  | payment `vendor` | `Transaction.seller` |
  | item `unitPrice` | `Item.price` — it is a **unit** price |
  | item `itemTotal` | `Item.price × quantity` (quantity `None` → 1) |
  | item `quantity`, `asin`, `title` | same-named fields |
  | order `total` | `grand_total`, with the fallback below |
  | order `tax` / `shipping` | `estimated_tax` / `shipping_total` |
  | order `promotion` | `subscription_discount + coupon_savings + promotion_applied` |

  `Item.price` was confirmed to be a unit price: `Σ price × quantity == subtotal`
  on **130/130** live orders, versus 123/130 for `Σ price`. The current MCP computes
  `itemTotal` the same way (`unitPrice × quantity`, patch lines 1274-1278), so the
  splitter sees identical semantics. The splitter only needs item *proportions* —
  `allocateAmazonItemsToBank` rescales to the bank charge — plus the completeness
  check in `amazonOrderLooksIncomplete` (items within $5 of order total).
- Jar source of truth is S3 (see Phase 3). Each run downloads it to a local
  `cookie_jar_path`, and uploads it back only if its contents changed. Back the jar up
  before `login()`: `check_response()` calls `logout()` on an auth redirect and wipes
  the local file, and that must not propagate to S3 as an empty jar.
- No credentials anywhere. If the jar is cold the command exits non-zero with a
  structured `{"status":"error","code":"COOKIES_EXPIRED"}` — never prompts.
  Enforced with an `IODefault` subclass that raises on any prompt.
- **Date-range shim.** `get_transactions(days=N)` takes a lookback window, not a
  range. Compute `days` from `start`, fetch, then filter to `[start, end]` locally.
- **Sign convention — no conversion.** An earlier draft said to normalise negative
  purchases. That was wrong: the existing parser already treats purchases as
  negative (`parseAmazonMcp.ts:156`, `isRefund: amountMilliunits > 0`), which is the
  library's convention too. Pass amounts through unchanged, and pin that with a test
  so nobody "fixes" it later.
- **Field names.** `order_placed_date` not `order_date`; `estimated_tax` not `tax`.
- **`$0 grand_total` fix — required, not cosmetic.** `amazonOrderNeedsRefetch`
  returns true for a 0/null total, so an order the library always reports as $0
  would be re-fetched on every sync. 2 of 130 live orders hit this.
  **Fallback: the sum of that order's transactions, joined on order number.** This is
  a hard fact (exact on both affected orders). If an order has no transactions, emit
  the total as missing rather than reconstructing one.
  `subtotal + tax + shipping − discounts` was considered and **rejected**: it missed on
  17 of 128 orders that do report a total, so it is a guess. That conflicts with the
  project rule that matching code uses hard facts only and does not tune rules to the
  current rows. Missing-total orders need a *stop-refetching* rule instead, e.g. a
  per-order attempt limit; decide that in Phase 2.

#### API reference for `amazon-orders` 4.6.0

Verified against the installed package, not the docs — the published docs are wrong
in places (they list a `keyword` param that does not exist).

```python
AmazonSession(username=None, password=None, debug=False, io=IODefault(),
              config=None, auth_forms=None, otp_secret_key=None, domain=None)
AmazonOrders(amazon_session, debug=None, config=None)
  .get_order_history(year=None, start_index=None, full_details=False,
                     keep_paging=True, time_filter=None, order_filter=None)
AmazonTransactions(amazon_session, debug=None, config=None)
  .get_transactions(days=365, next_page_data=None, keep_paging=True, order_id=None)
```

- `get_order_history` filters by **`year`** or `time_filter`
  (`"last30"`, `"months-3"`, `"year-YYYY"`) — **not** a date range. Passing both raises.
- `get_transactions` takes **`days`** (a lookback window), not a range. Hence the
  Phase 1 shim.
- `full_details=True` costs one extra request per order and is **required** for
  `subtotal`, `estimated_tax`, and all discount fields.
- `IODefault` is a plain two-method class (`echo`, `prompt`) injected via `io=`. This
  is the seam a UI-driven login would subclass. `prompt()` is called synchronously
  inside the login retry loop, so a web UI would have to block on it — there is no
  async or resumable-callback path.
- **`is_authenticated` is not persisted.** Always `False` on construction; call
  `login()` each process even with a valid jar (it short-circuits via
  `auth_cookies_stored()`).
- **`check_response()` calls `logout()`** on an auth redirect, which *wipes the
  cookie jar*. A rejected jar does not fail cleanly — it destroys itself. Back up the
  jar before any risky operation.
- Config: `AmazonOrdersConfig(data={...})`; `cookie_jar_path` defaults to
  `~/.config/amazonorders/cookies.json`, `output_dir` is debug HTML only.

**Entity fields** (names differ from older docs — grep any code written against them):

| Entity | Fields |
|---|---|
| `Order` | `order_number`, `order_placed_date` (*not* `order_date`), `grand_total`, `subtotal`, `estimated_tax` (*not* `tax`), `shipments`, `items`, `item_count`, `cancelled`, `shipping_total`, `subscription_discount`, `coupon_savings`, `promotion_applied`, `gift_card`, `payment_method_last_4` (string, preserves leading zeros) |
| `Item` | `title`, `price`, `quantity` (`None` for weight-sold), `asin` (regex-derived from `link`), `seller` (a `Seller` object, not a string), `link`, `condition` |
| `Shipment` | `items`, `delivery_status`, `tracking_link` — that is all |
| `Transaction` | `completed_date`, `payment_method`, `payment_method_last_4`, `grand_total`, `is_refund`, `order_number`, `order_details_link`, `seller` |

All entities expose `to_dict()`, which recurses nested entities and ISO-formats
dates — useful for emitting the JSON payloads in Phase 1.

**Known upstream fragility:** `transactions.py:141-154` only assigns `min_date` in the
`else` branch but reads it in `if order_id or transaction.completed_date >= min_date`.
Short-circuit evaluation saves it today; any reordering raises `UnboundLocalError`.

### Phase 2 — API adapter swap

- New `amazonSyncClient.ts` implementing `AmazonOrdersSource` as plain HTTP calls to
  `AMAZON_SYNC_URL` (new optional env var, mirroring
  `getCategorizationScorerUrl()`). Keep the `AMAZON_ORDERS_SYNC_TIMEOUT_MS` timeout.
  Serialisation moves to the Python side (Phase 1); the client needs no `toolChain`.
- Delete `amazonMcpClient.ts`; keep `parseAmazonMcp.ts` (rename to
  `parseAmazonPayloads.ts`) since the shapes are unchanged.
- Replace the `AMAZON_ORDERS_MCP_ENTRY` 503s (`amazonMcpClient.ts:40-49`) with
  cookie-jar-state 503s carrying a distinct code so the UI can offer "refresh
  cookies" rather than a generic failure.
- Rework the not-authenticated message (`syncAmazonOrders.ts:81-87`) — "Finish login
  in the Chromium window" is no longer meaningful.

### Phase 3 — Cookie refresh command

`pnpm amazon:refresh-cookies`, the answer to "I don't want to forget this process".
**This is the primary path** (decided 2026-10-03); UI login is deferred until it works.

**Transport: S3** (decided 2026-10-03). The existing `s3.home.lan` store, a private
key such as `amazon/cookies.json`. The sync container downloads it at the start of
each run and uploads it back if the library rewrote it. Chosen over an API upload
endpoint (the API only has browser sessions, so a CLI would need a new token) and
over SSH + `docker cp` (needs host access and Coolify's generated volume names).

1. Runs the stage 1 login locally — same code, `PlaywrightJSAuthForm` +
   `PlaywrightAcicForm` registered — prompting for email, password, SMS code.
   Nothing stored.
2. Writes the jar to a temp file and checks the five auth-bearing cookie names are
   present before going any further.
3. **Verifies locally first**: runs the stage 2 check (HTTP-only, `check-auth`)
   against the new jar, so a bad jar never overwrites a good one.
4. Uploads to S3, keeping the previous object as `cookies.previous.json` for rollback.
5. Prints what happened: cookie names (never values), upload key, and the previous
   jar's age — which is also the lifetime measurement.

Needs: Python + the `[browser]` extra on the desktop. The command should create its
own venv on first run so there is nothing to remember.

**Use a dedicated bucket and service account, not the receipts bucket.** Checked
2026-10-03: the receipts bucket looks private. `scripts/provision-receipts-s3.mjs`
creates only a bucket-scoped IAM policy and a service account, with no anonymous
policy, and the API proxies reads through `GetObjectCommand`
(`s3ReceiptStorage.ts:53`) rather than presigned or public URLs. But an anonymous
bucket policy is server-side state the repo can't prove absent, and a jar is a live
Amazon session, a different risk from a receipt photo. A separate
`amazon-session` bucket, provisioned by the same script pattern, means leaked receipt
credentials can't read the session and vice versa. Settings: `AMAZON_COOKIES_S3_*`.

Documented in `docs/amazon-cookie-refresh.md`, one page, command first.

### Phase 4 — Upload endpoint + UI (fallback; can slip until after Phase 7)

- `POST /api/amazon-orders/cookies` — authenticated, validates the JSON is a cookie
  dict containing the auth-bearing names (`x-main`, `at-main`, `sess-at-main`,
  `ubid-main`, `session-id`), writes it to the same S3 key the command uses.
- Admin page with a file drop, showing current jar age and last successful sync.
- Never log or echo cookie *values*; names only.

### Phase 5 — Expiry detection + notification

- Extend `getAmazonOrdersStatus` with `cookieJarAge`, `cookieJarPresent`, and
  `lastSyncOutcome`.
- On `COOKIES_EXPIRED`, persist the state so the UI surfaces a banner rather than
  failing silently weeks later.
- Cheap daily `check-auth` probe so expiry is discovered before the next scheduled
  sync needs it.

### Phase 6 — Digital subscriptions

~26% of transactions have a blank `order_number` — `Amazon Kids+`, `D01-*` prefixes.
These are real charges with no retail order and no line items.

- Ingest as payments with a `digital` flag; skip invoice fetching for them.
- They cannot be split per-item, so surface them as single-line YNAB transactions.
- Decide whether they participate in coverage tracking (proposed: yes — they are
  real charges in the range).

### Phase 7 — Deployment

- `apps/amazon-sync/Dockerfile` on `python:3.12-slim`, **no browser packages**.
  Header comment explaining why no Chromium is needed, mirroring the detail in
  `transactions-retrieval/Dockerfile`.
- `docker-compose-prod.yml`: new service, S3 settings for the cookie jar (no volume
  needed — the jar lives in S3),
  `depends_on` the migrator.
- **Fix the now-false comments** at `docker-compose-prod.yml:60-61` and
  `.env.compose.prod.example:62-63`.
- **Scheduling lives in the API, not Coolify cron.** The API already runs in-process
  `setInterval` schedulers (`startOutboundSyncFlusher.ts`,
  `startReceiptBindingSweeper.ts`). Add `startAmazonSyncScheduler.ts` on the same
  pattern: no external cron, no `docker exec`, and no auth token to call a protected
  endpoint. The `docker exec` cron pattern exists for `transactions-retrieval` only
  because that is a standalone one-shot script; this is not.
- The amazon-sync container is a long-running service with a `/health` check, like
  `scorer`, not an idle `sleep infinity` container.

### Phase 8 — Retire the MCP and update tests

- Delete `third_party/amazon-order-history-csv-download-mcp`, the patch,
  `scripts/setup-amazon-mcp.mjs`, the `setup:amazon-mcp` script, and the
  `AMAZON_ORDERS_MCP_ENTRY` env var.
- Update `third_party/README.md`, `README.md:5-9`, `docs/amazon-classify-sync.md`
  (its mermaid diagram names "Playwright MCP" as a participant).
- Tests: `parseAmazonMcp.test.ts` keeps its payload fixtures; `syncAmazonOrders.test.ts`
  and `fetchAmazonOrderInvoices.test.ts` stub the interface so they need only minor
  updates. Add coverage for the negative-amount convention, `$0 grand_total`
  fallback, and blank-order-number transactions.
- **Fixtures must be synthetic.** `.spike/out*/` holds real order data: titles,
  ASINs, card last-4s, order numbers. Never copy it into a fixture. Hand-write minimal
  fixtures that pin the facts the spike established: unit-price semantics,
  `quantity: None` for single items, negative `promotion_applied`, `grand_total: 0.0`
  with real subtotal and tax, blank `order_number` on digital charges, and split
  shipments summing to the order total.

## First milestone

Phases 1 and 2 only: the Python service and the API client, working end to end
against the **dev** stack with the desktop jar, and the MCP left untouched alongside.
This is a vertical slice. It's the point where the real splitter tests the data-fit
claims, not just the offline analysis. Phases 3–8 follow once it works.

## Environment facts this plan assumes

Established during research; not obvious from the repo.

- **Hosting is Coolify on the home lan**, with Caddy as the edge proxy (outside this
  repo — there is no Caddyfile here). `postgres.home.lan`, `s3.home.lan`. There is no
  `.github/` directory and no CI: Coolify builds from a git clone.
- **The residential IP matters.** Every stealth benchmark found IP reputation
  dominates tool choice. A datacenter IP (Fly, Railway) would draw constant
  challenges; the home-lan host is likely the *same public IP* as the desktop that
  mints the jar, so the egress-IP variable largely cancels out. Do not move this
  service to a cloud host without re-testing.
- **No resource limits are declared** anywhere in `docker-compose-prod.yml` — no
  `mem_limit`, no `cpus`, no `shm_size`. Fine here (no browser on the server), but
  worth knowing if the noVNC fallback is ever revived, since Chromium needs
  `shm_size: 2g`.
- **Postgres is external/managed**, not in the stack. The API's SQLite was retired in
  favour of shared Postgres (commit `ce27664`), but `docs/amazon-classify-sync.md`
  still describes the SQLite path and is stale.
- **Amazon account:** `amazon.com` (US), **SMS 2FA**. SMS is why TOTP auto-solve is
  out of scope — it needs switching to an authenticator app first.
- **Python 3.12.0** is on the dev machine; `amazon-orders` needs ≥3.9.
- **`.spike/` is gitignored** (added this session). It holds a venv and real order
  data — never commit it.

## Risks

- **Cookie jar lifetime: at least 19 days of non-use.** The jar minted 2026-09-14
  sat untouched until 2026-10-03 and still authenticated. Reads do not rewrite the
  local file (mtime unchanged), though one read on day 19 cannot rule out Amazon
  extending the session server-side on access. Upper bound unknown; Phase 3's
  "previous jar age" output and Phase 5's age reporting keep measuring.
- **Validated against one month of orders.** Other shapes may surprise us. Mitigate
  by keeping the MCP in git history and running both for one cycle before Phase 8.
- **A fourth runtime** (Python) in a Node/.NET stack. Contained to one service.
- **ToS.** Automated access conflicts with Amazon's Conditions of Use; realistic
  downside is account action. Low volume, own account, residential IP via the
  home-lan Coolify host. A scheduled sync makes this unattended — a deliberate choice.

## Out of scope

- **UI-driven login — deferred, not rejected.** Decided 2026-10-03: get the command
  path working first, then evaluate. Notes for when it is revisited: the challenge
  solver (`PlaywrightJSAuthForm`) runs headless, so a server-side login needs a
  headless Chromium in *one* login container only — no Xvfb, VNC, profile volume or
  `shm_size`; the sync container stays browser-free. Login code is identical to
  stage 1; only the `IODefault` subclass changes (state machine
  `idle → needs_credentials → needs_otp → done/failed`, `login()` in a worker thread
  because `prompt()` blocks inside the retry loop). Untested: whether the JS
  challenge resolves headless in a GPU-less Linux container, whether the 5s
  `auth_reattempt_wait` re-triggers SMS, and whether `_solve_captcha`'s
  `PIL.Image.show()` hangs without a display. Installing Chromium on
  `python:3.12-slim` needs `playwright install --with-deps` (or the
  `mcr.microsoft.com/playwright/python` base) for system libraries.

- TOTP auto-solve (`AMAZON_OTP_SECRET_KEY`). Would make re-auth unattended, but
  requires switching the account from SMS to an authenticator app. Revisit if manual
  refresh proves annoying.
- DSAR CSV import as a backstop. Better data, no ToS friction, but semi-manual.
  Worth building if scraping becomes unreliable.
