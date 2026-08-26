import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('amazon_split_overlays')
        .addColumn('transaction_id', 'text', (col) => col.primaryKey())
        .addColumn('fingerprint', 'text', (col) => col.notNull())
        .addColumn('overlay_json', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('amazon_split_overlays').execute();
}
