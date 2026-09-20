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
Desktop (occasional)                 Server (continuous)
────────────────────                 ───────────────────
pnpm amazon:refresh-cookies          amazon-sync container
  └ Playwright + [browser] extra       └ amazon-orders, NO browser
  └ solves JS challenge                └ reads jar from volume
  └ mints cookies.json                 └ emits MCP-compatible JSON on stdout
  └ delivers to server ──────────────► └ API spawns it, parses, upserts
```

The API keeps its existing seam. `AmazonOrdersSource`
(`amazonOrdersSource.ts:4-8`) is three methods; only the implementation behind it
changes. The Python process emits the **same JSON payload shapes** the current
`parseAmazonMcp.ts` already validates, so the parse layer survives nearly intact.

## Phases

### Phase 1 — Python sync service

New `apps/amazon-sync/`, a CLI emitting JSON on stdout.

- Three subcommands mirroring the source interface: `check-auth`,
  `get-transactions --start --end`, `get-order-details --order-id`.
- Output shapes match `parseAmazonMcp.ts` exactly: `{ authenticated, username,
  message, loginUrl }`, `{ transactions[], paginationComplete }`,
  and the order-details shape including the `purchasedItems` wrapper.
- `cookie_jar_path` from `AMAZON_COOKIE_JAR_PATH`, defaulting to a volume path.
- No credentials anywhere. If the jar is cold the command exits non-zero with a
  structured `{"status":"error","code":"COOKIES_EXPIRED"}` — never prompts.
  Enforced with an `IODefault` subclass that raises on any prompt.
- **Date-range shim.** `get_transactions(days=N)` takes a lookback window, not a
  range. Compute `days` from `start`, fetch, then filter to `[start, end]` locally.
- **Sign convention.** `Transaction.is_refund = grand_total > 0`, so purchases are
  **negative**. Normalise to the existing positive-amount convention at the boundary
  and cover it with a test — getting this wrong inverts every YNAB split.
- **Field names.** `order_placed_date` not `order_date`; `estimated_tax` not `tax`.
- **`$0 grand_total` fix.** When `grand_total` is 0 or missing, fall back to
  `subtotal + estimated_tax`, and prefer the transaction amount when joinable.

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

- New `amazonPythonClient.ts` implementing `AmazonOrdersSource`, spawning the
  container command and parsing stdout. Keep the serialised `toolChain` pattern
  from `amazonMcpClient.ts:88-94` and the `AMAZON_ORDERS_SYNC_TIMEOUT_MS` timeout.
- Delete `amazonMcpClient.ts`; keep `parseAmazonMcp.ts` (rename to
  `parseAmazonPayloads.ts`) since the shapes are unchanged.
- Replace the `AMAZON_ORDERS_MCP_ENTRY` 503s (`amazonMcpClient.ts:40-49`) with
  cookie-jar-state 503s carrying a distinct code so the UI can offer "refresh
  cookies" rather than a generic failure.
- Rework the not-authenticated message (`syncAmazonOrders.ts:81-87`) — "Finish login
  in the Chromium window" is no longer meaningful.

### Phase 3 — Cookie refresh command

`pnpm amazon:refresh-cookies`, the answer to "I don't want to forget this process".

1. Runs the Playwright login locally (prompts for email/password/OTP; nothing stored).
2. Writes `cookies.json`.
3. Delivers it, preferring in order: direct S3 upload to the existing
   `s3.home.lan` bucket → authenticated POST to the API upload endpoint → prints the
   absolute path with copy-paste `docker cp` instructions.
4. Verifies by calling the API status endpoint and reporting the new expiry.

Documented in `docs/amazon-cookie-refresh.md`, one page, command first.

### Phase 4 — Upload endpoint + UI

- `POST /api/amazon-orders/cookies` — authenticated, validates the JSON is a cookie
  dict containing the auth-bearing names (`x-main`, `at-main`, `sess-at-main`,
  `ubid-main`, `session-id`), writes to the volume atomically.
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
- `docker-compose-prod.yml`: new service, a named volume for the cookie jar,
  `depends_on` the migrator.
- **Fix the now-false comments** at `docker-compose-prod.yml:60-61` and
  `.env.compose.prod.example:62-63`.
- Cron via `docker exec`, matching the documented `transactions-retrieval` pattern.
- Verify the cwd/entrypoint assumption on a freshly built image before documenting
  the command — that exact mistake cost two commits (`5dad2fe`, `3d950e4`).

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

- **Cookie jar lifetime is unknown.** Determines refresh cadence. Phase 5's age
  reporting starts gathering that data from day one.
- **Validated against one month of orders.** Other shapes may surprise us. Mitigate
  by keeping the MCP in git history and running both for one cycle before Phase 8.
- **A fourth runtime** (Python) in a Node/.NET stack. Contained to one service.
- **ToS.** Automated access conflicts with Amazon's Conditions of Use; realistic
  downside is account action. Low volume, own account, residential IP via the
  home-lan Coolify host. A scheduled sync makes this unattended — a deliberate choice.

## Out of scope

- TOTP auto-solve (`AMAZON_OTP_SECRET_KEY`). Would make re-auth unattended, but
  requires switching the account from SMS to an authenticator app. Revisit if manual
  refresh proves annoying.
- DSAR CSV import as a backstop. Better data, no ToS friction, but semi-manual.
  Worth building if scraping becomes unreliable.
