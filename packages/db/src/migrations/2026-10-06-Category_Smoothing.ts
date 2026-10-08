import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Per-category smoothing window for the spend-over-time chart.
 *
 * A category with a row here has each purchase spread evenly over `window_days` days starting
 * on the purchase date (groceries bought today are eaten over the next week). Categories
 * without a row are charted as spent. Kept out of `categories` because the YNAB sync
 * upserts that table.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('category_smoothing')
        .ifNotExists()
        .addColumn('category_id', 'text', (col) => col.primaryKey())
        .addColumn('window_days', 'integer', (col) => col.notNull().check(sql`window_days BETWEEN 2 AND 365`))
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('category_smoothing').ifExists().execute();
}
