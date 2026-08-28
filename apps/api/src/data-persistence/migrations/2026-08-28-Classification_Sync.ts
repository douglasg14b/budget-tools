import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('classification_sync')
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
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('classification_sync').execute();
}
