# Implementation plan: API write path

Maps to live classification write-back: enqueue decisions, batch PATCH YNAB, and hide already-pushed ids from the review queue while the Postgres mirror lags.

## Goal

A reviewer in **Live** mode can accept, change, or split transactions; those decisions persist in API SQLite, flush to YNAB in batched PATCHes, and stay out of the classify queue until `transactions-retrieval` catches up. **Practice** mode never writes SQLite or YNAB.

When complete:

- `POST /api/categorization/decisions` enqueues live decisions (`requireLiveMode`; 403 in practice)
- `DELETE /api/categorization/decisions/{transactionId}` retracts `pending` or `failed` rows only
- `GET /api/categorization/outbound-sync` and `POST /api/categorization/outbound-sync/flush` report and flush the queue
- `listPendingTransactions` excludes in-flight and pushed ids after reconciling SQLite against the current Postgres pending set
- `pnpm --filter @budget-tools/api tsoa` regenerates OpenAPI; `web-sdk` rebuilds typed hooks
- `pnpm check` still passes

## Out of scope

- `categorization_feedback` Postgres audit rows
- Writing `transactions` in Postgres from the YNAB PATCH response
- Changes to `transactions-retrieval`
- Practice persistence of any kind
- Reverse-PATCH undo after a successful flush
- `GET /api/payees`, `markApprovedInYnab` checkbox

## Ownership

Postgres (`transactions`) is the last YNAB **pull**, owned by `transactions-retrieval`. The API does not upsert that table.

SQLite `classification_sync` is the last classification **action**. It is both the outbound queue and the overlay used while the pull is stale (~30 minutes).

Practice decisions stay in React session state. Classify UI remounts on operating-mode change (`key={mode}`), so practice work cannot leak into live POSTs. Already-queued live rows still flush after a switch to practice; `requireLiveMode` gates enqueue, not flush.

## SQLite: `classification_sync`

Migration: [2026-08-28-Classification_Sync.ts](../../../apps/api/src/data-persistence/migrations/2026-08-28-Classification_Sync.ts).

| Column | Role |
|---|---|
| `transaction_id` | YNAB transaction id (PK) |
| `decision_json` | Category `{ kind, categoryId, payeeName?, memo?, flagColor? }`, split `{ kind, lines, payeeName?, memo?, flagColor? }`, or annotate `{ kind, memo?, flagColor?, approved }` |
| `status` | `pending` → `syncing` → `synced` \| `failed`; later `confirmed` |
| `batch_id` | Groups rows in one PATCH |
| `attempt_count`, `last_error` | Retry / failure detail |
| `created_at`, `updated_at`, `synced_at`, `confirmed_at` | Timestamps |

Latest live decision **replaces** a `pending` or `failed` row. `syncing`, `synced`, and `confirmed` category/split rows refuse replacement (409). An annotate row is replaceable in any status; replacement clears `batch_id`, so an in-flight batch cannot mark the replacement `synced`. When an annotate row that is not yet `synced` is replaced, its `memo` / `flagColor` carry forward into any field the new decision leaves absent, so a flag set before the categorize is not lost.

Rejects are not stored. They stay uncategorized in YNAB and remain in the review queue.

### Memo, flag, and annotate

Category and split decisions may carry a parent `memo` (at most 500 characters) and `flagColor` (`red` \| `orange` \| `yellow` \| `green` \| `blue` \| `purple`). An absent field leaves YNAB's value alone; `null` clears it; a blank memo is stored as `null`. Only fields the reviewer changed are sent, so concurrent YNAB-side edits are not overwritten.

`annotate` sets memo and/or flag without categorizing ("flag it, move on"). It needs at least one of the two and rejects `categoryId`, `lines`, and `payeeName`. The server stores the transaction's mirrored `approved` value with the decision, because YNAB unapproves a PATCHed transaction that omits `approved`. Annotated transactions stay in the review queue.

## Stale-source reconciliation

`listPendingTransactions` loads Postgres pending rows, then:

1. `synced` category/split ids **not** in that set → `confirmed` (mirror caught up)
2. `confirmed` ids **in** that set again → delete the row (YNAB-side revert; re-enter the queue)
3. `synced` annotate rows → delete once the mirrored memo/flag match what was sent (absent fields ignored), or once the id leaves the set
4. Exclude category/split ids with status `pending` \| `syncing` \| `synced` \| `failed`; annotate rows never exclude

Failed rows stay out of classify (retry via outbound-sync) so the reviewer does not double-apply.

Amazon oldest-uncategorized and ML scoring share this filter because they call `listPendingTransactions`.

## Endpoints

### `POST /api/categorization/decisions`

Body: `{ decisions: ClassificationDecisionDto[] }`. Array so Accept-all-certain is one round trip.

1. `requireLiveMode()`
2. Parse and validate (assignable category ids; split milliunits sum to the Postgres amount)
3. 404 if a transaction id is missing from Postgres
4. Enqueue SQLite rows
5. Kick the flusher when pending count ≥ batch size
6. Do **not** call YNAB on this request

### `DELETE /api/categorization/decisions/{transactionId}`

Retract while `pending` or `failed`. `syncing` / `synced` / `confirmed` → 409. Missing row is a no-op. Live `⌘Z` uses this.

### `GET /api/categorization/ynab-flags`

`{ flags: [{ color, name }] }` for all six YNAB flag colors. YNAB exposes flag names only on transactions, so `name` is the most recent non-empty `flag_name` on a non-deleted mirrored transaction with that color, or `null`. Queue transactions carry their own `flagColor` / `flagName`.

### `GET /api/categorization/outbound-sync`

Counts: pending, syncing, failed, synced-but-unconfirmed, oldest pending timestamp, last error.

### `POST /api/categorization/outbound-sync/flush`

Manual flush; still honors the min interval and 429 backoff.

## YNAB PATCH

One HTTP call per flush: `transactions.updateTransactions`. Credentials: `YNAB_API_KEY`, `YNAB_BUDGET_NAME` (lazy in [environment.ts](../../../apps/api/src/environment.ts); flush 503s if unset).

- Category: `approved: true`, `category_id`, optional `payee_name`
- Split: `approved: true`, `category_id: null`, `subtransactions: [{ amount, category_id, memo }]`
- Annotate: `approved` set to the stored mirrored value; no `category_id`
- Any kind: `memo` / `flag_color` only when present in the decision (`null` clears)

No GET-to-verify. The shared YNAB budget is 200 requests/hour with retrieval GETs; batching is the conservation strategy.

## Flusher

Started from API `start()` ([server.ts](../../../apps/api/src/server.ts)).

| Trigger | Default |
|---|---|
| Count | `YNAB_FLUSH_BATCH_SIZE` (25) pending rows |
| Interval | `YNAB_FLUSH_INTERVAL_MS` (5 minutes) if any pending |
| Manual | `POST .../flush` |
| Startup | Resume `syncing` → `pending`, then flush |
| Min gap | `YNAB_FLUSH_MIN_INTERVAL_MS` (30 seconds) between PATCHes |

On success: `synced`. On 429: revert batch to `pending`, honor Retry-After (default 60s). On other errors: `failed` with the message.

## Web

Live `commit` / Accept-all POSTs then keeps the optimistic session; failure rolls those ids back. Live undo DELETEs if the row is still retractable. Classify workspace and table remount on mode change. The header **OutboundSyncChip** shows queued/failed counts and Flush now.

## Env

| Variable | Default | Notes |
|---|---|---|
| `YNAB_API_KEY` | empty | Required at flush time |
| `YNAB_BUDGET_NAME` | empty | Required at flush time |
| `YNAB_FLUSH_BATCH_SIZE` | 25 | Count trigger and PATCH size |
| `YNAB_FLUSH_INTERVAL_MS` | 300000 | Background timer |
| `YNAB_FLUSH_MIN_INTERVAL_MS` | 30000 | Floor between PATCHes |

## Verification

- `pnpm --filter @budget-tools/api tsoa` then `pnpm --filter @budget-tools/web-sdk build`
- `pnpm --filter @budget-tools/api test` (classification_sync repo, reconcile, PATCH payload, flusher 429 revert, practice 403)
- `pnpm --filter @budget-tools/web test` (live payload skips rejects; session remove)
- `pnpm check`
- Smoke: Practice accept does not create SQLite rows. Live accept enqueues; queue omits that id after refetch; Flush now PATCHes YNAB; after the next retrieval pull the row becomes `confirmed`.
