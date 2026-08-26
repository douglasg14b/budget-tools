import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('amazon_payments')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('payment_date', 'text', (col) => col.notNull())
        .addColumn('amount_milliunits', 'integer', (col) => col.notNull())
        .addColumn('currency', 'text', (col) => col.notNull())
        .addColumn('order_ids_json', 'text', (col) => col.notNull())
        .addColumn('card_last4', 'text')
        .addColumn('vendor', 'text')
        .addColumn('is_refund', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('raw_json', 'text', (col) => col.notNull())
        .execute();

    await db.schema
        .createIndex('amazon_payments_date_amount_idx')
        .on('amazon_payments')
        .columns(['payment_date', 'amount_milliunits'])
        .execute();

    await db.schema
        .createTable('amazon_orders')
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
        .on('amazon_order_items')
        .column('order_id')
        .execute();

    await db.schema
        .createTable('amazon_sync_state')
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('last_auth_check', 'text')
        .addColumn('last_authenticated', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('covered_ranges_json', 'text', (col) => col.notNull())
        .execute();

    await sql`INSERT INTO amazon_sync_state (id, last_auth_check, last_authenticated, covered_ranges_json) VALUES (1, NULL, 0, '[]')`.execute(
        db,
    );
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('amazon_order_items').execute();
    await db.schema.dropTable('amazon_orders').execute();
    await db.schema.dropTable('amazon_payments').execute();
    await db.schema.dropTable('amazon_sync_state').execute();
}
