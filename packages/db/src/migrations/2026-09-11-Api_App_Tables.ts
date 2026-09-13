import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * The API's application tables, ported from its retired SQLite database into the shared
 * Postgres. These were previously eight SQLite Kysely migrations under
 * `apps/api/src/data-persistence/migrations/`. Because production Postgres has never had any of
 * these tables, we create each in its FINAL shape (post-reshape) rather than replaying the
 * historical ALTER sequence (e.g. the travel-window account split).
 *
 * Dialect notes vs. the old SQLite migrations:
 * - The four SQLite `integer` boolean columns become native `boolean`.
 * - `travel_windows.created_at/updated_at` (the only columns the app writes as JS `Date`) become
 *   `timestamptz` so `pg` returns `Date` natively (the SqlDatePlugin is gone).
 * - Other date/timestamp columns stay `text`: the app treats them as ISO strings and relies on
 *   lexical ordering, which Postgres `text` preserves.
 * - `*_json` columns stay `text`: the app does its own JSON.stringify/parse; no SQL JSON funcs.
 * - `created`/`ifNotExists` is used so a re-run against a partially-provisioned DB is safe.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    // --- travel windows -----------------------------------------------------------------
    await db.schema
        .createTable('travel_windows')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`kind IN ('vacation', 'work')`))
        .addColumn('start_date', 'text', (col) => col.notNull())
        .addColumn('end_date', 'text', (col) => col.notNull())
        .addColumn('location', 'text')
        .addColumn('created_at', sql`timestamptz`, (col) => col.notNull())
        .addColumn('updated_at', sql`timestamptz`, (col) => col.notNull())
        .addCheckConstraint('travel_windows_dates', sql`start_date <= end_date`)
        .execute();

    await db.schema
        .createIndex('travel_windows_start_date_idx')
        .ifNotExists()
        .on('travel_windows')
        .column('start_date')
        .execute();

    await db.schema
        .createTable('travel_window_accounts')
        .ifNotExists()
        .addColumn('window_id', 'text', (col) => col.notNull())
        .addColumn('account_id', 'text', (col) => col.notNull())
        .addColumn('account_name', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('travel_window_accounts_pk', ['window_id', 'account_id'])
        .execute();

    await db.schema
        .createTable('travel_bias_config')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
        .execute();

    await sql`INSERT INTO travel_bias_config (id, enabled) VALUES (1, true) ON CONFLICT (id) DO NOTHING`.execute(db);

    // --- amazon order cache -------------------------------------------------------------
    await db.schema
        .createTable('amazon_payments')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('payment_date', 'text', (col) => col.notNull())
        .addColumn('amount_milliunits', 'integer', (col) => col.notNull())
        .addColumn('currency', 'text', (col) => col.notNull())
        .addColumn('order_ids_json', 'text', (col) => col.notNull())
        .addColumn('card_last4', 'text')
        .addColumn('vendor', 'text')
        .addColumn('is_refund', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('raw_json', 'text', (col) => col.notNull())
        .execute();

    await db.schema
        .createIndex('amazon_payments_date_amount_idx')
        .ifNotExists()
        .on('amazon_payments')
        .columns(['payment_date', 'amount_milliunits'])
        .execute();

    await db.schema
        .createTable('amazon_orders')
        .ifNotExists()
        .addColumn('order_id', 'text', (col) => col.primaryKey())
        .addColumn('order_date', 'text')
        .addColumn('total_milliunits', 'integer')
        .addColumn('shipping_milliunits', 'integer')
        .addColumn('tax_milliunits', 'integer')
        .addColumn('promotion_milliunits', 'integer')
        .addColumn('raw_json', 'text', (col) => col.notNull())
        .execute();

    await db.schema
        .createTable('amazon_order_items')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('order_id', 'text', (col) => col.notNull())
        .addColumn('line_index', 'integer', (col) => col.notNull())
        .addColumn('asin', 'text')
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('quantity', 'integer', (col) => col.notNull())
        .addColumn('item_total_milliunits', 'integer', (col) => col.notNull())
        .addColumn('raw_json', 'text', (col) => col.notNull())
        .execute();

    await db.schema
        .createIndex('amazon_order_items_order_id_idx')
        .ifNotExists()
        .on('amazon_order_items')
        .column('order_id')
        .execute();

    await db.schema
        .createTable('amazon_sync_state')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('last_auth_check', 'text')
        .addColumn('last_authenticated', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('covered_ranges_json', 'text', (col) => col.notNull())
        .execute();

    await sql`INSERT INTO amazon_sync_state (id, last_auth_check, last_authenticated, covered_ranges_json) VALUES (1, NULL, false, '[]') ON CONFLICT (id) DO NOTHING`.execute(
        db,
    );

    // --- amazon split overlays ----------------------------------------------------------
    await db.schema
        .createTable('amazon_split_overlays')
        .ifNotExists()
        .addColumn('transaction_id', 'text', (col) => col.primaryKey())
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('overlay_json', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();

    // --- operating mode -----------------------------------------------------------------
    await db.schema
        .createTable('operating_mode')
        .ifNotExists()
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('mode', 'text', (col) => col.notNull().check(sql`mode IN ('practice', 'live')`))
        .execute();

    await sql`INSERT INTO operating_mode (id, mode) VALUES (1, 'practice') ON CONFLICT (id) DO NOTHING`.execute(db);

    // --- classification sync ------------------------------------------------------------
    await db.schema
        .createTable('classification_sync')
        .ifNotExists()
        .addColumn('transaction_id', 'text', (col) => col.primaryKey())
        .addColumn('decision_json', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) =>
            col.notNull().check(sql`status IN ('pending', 'syncing', 'synced', 'failed', 'confirmed')`),
        )
        .addColumn('batch_id', 'text')
        .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('last_error', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .addColumn('synced_at', 'text')
        .addColumn('confirmed_at', 'text')
        .execute();

    // --- receipts (final shape, incl. the later perceptual_hash column) -----------------
    await db.schema
        .createTable('receipts')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('vendor', 'text')
        .addColumn('purchase_date', 'text')
        .addColumn('printed_milliunits', 'integer')
        .addColumn('extract_status', 'text', (col) =>
            col.notNull().check(sql`extract_status IN ('pending', 'gated', 'ungated', 'failed')`),
        )
        .addColumn('extract_json', 'text')
        .addColumn('raw_text', 'text')
        .addColumn('original_path', 'text', (col) => col.notNull())
        .addColumn('transaction_id', 'text')
        .addColumn('content_hash', 'text', (col) => col.notNull().unique())
        .addColumn('perceptual_hash', 'text')
        .addColumn('totals_disagree', 'boolean', (col) => col.notNull().defaultTo(false))
        .execute();

    await db.schema
        .createIndex('receipts_purchase_date_idx')
        .ifNotExists()
        .on('receipts')
        .column('purchase_date')
        .execute();
    await db.schema
        .createIndex('receipts_printed_milliunits_idx')
        .ifNotExists()
        .on('receipts')
        .column('printed_milliunits')
        .execute();
    await db.schema.createIndex('receipts_vendor_idx').ifNotExists().on('receipts').column('vendor').execute();
    await db.schema
        .createIndex('receipts_transaction_id_idx')
        .ifNotExists()
        .on('receipts')
        .column('transaction_id')
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('receipts').ifExists().execute();
    await db.schema.dropTable('classification_sync').ifExists().execute();
    await db.schema.dropTable('operating_mode').ifExists().execute();
    await db.schema.dropTable('amazon_split_overlays').ifExists().execute();
    await db.schema.dropTable('amazon_sync_state').ifExists().execute();
    await db.schema.dropTable('amazon_order_items').ifExists().execute();
    await db.schema.dropTable('amazon_orders').ifExists().execute();
    await db.schema.dropTable('amazon_payments').ifExists().execute();
    await db.schema.dropTable('travel_bias_config').ifExists().execute();
    await db.schema.dropTable('travel_window_accounts').ifExists().execute();
    await db.schema.dropTable('travel_windows').ifExists().execute();
}
