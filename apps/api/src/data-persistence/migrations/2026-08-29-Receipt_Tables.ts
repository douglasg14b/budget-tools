import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('receipts')
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
        .addColumn('totals_disagree', 'integer', (col) => col.notNull().defaultTo(0))
        .execute();

    await db.schema.createIndex('receipts_purchase_date_idx').on('receipts').column('purchase_date').execute();
    await db.schema
        .createIndex('receipts_printed_milliunits_idx')
        .on('receipts')
        .column('printed_milliunits')
        .execute();
    await db.schema.createIndex('receipts_vendor_idx').on('receipts').column('vendor').execute();
    await db.schema.createIndex('receipts_transaction_id_idx').on('receipts').column('transaction_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('receipts').execute();
}
