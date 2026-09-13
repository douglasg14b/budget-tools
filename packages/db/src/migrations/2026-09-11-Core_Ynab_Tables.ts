import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Baseline of the shared Budget Tools Postgres schema.
 *
 * This reproduces the schema that was previously applied by hand via
 * `init/docker_postgres_init.sql` and `apps/transactions-retrieval/src/data/scaffold.sql`.
 * Every object is created `IF NOT EXISTS` so the first run against an already-provisioned
 * production database is a no-op that simply records this migration as applied — the
 * migrator then owns the schema going forward.
 *
 * Roles and grants are intentionally NOT created here; they remain a bootstrap concern
 * (see `packages/db/src/bootstrap/roles.sql`).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('tracking')
        .ifNotExists()
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('last_pulled_date', sql`timestamptz`)
        .addColumn('last_server_knowledge', 'numeric')
        .addColumn('cache_budget', 'jsonb')
        .execute();

    await db.schema
        .createTable('transactions')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.notNull().primaryKey())
        .addColumn('date', 'date', (col) => col.notNull())
        .addColumn('amount', 'integer', (col) => col.notNull())
        .addColumn('memo', 'text')
        .addColumn('cleared', 'text', (col) => col.notNull())
        .addColumn('approved', 'boolean', (col) => col.notNull())
        .addColumn('flag_color', 'text')
        .addColumn('flag_name', 'text')
        .addColumn('account_id', 'text', (col) => col.notNull())
        .addColumn('payee_id', 'text')
        .addColumn('category_id', 'text')
        .addColumn('transfer_account_id', 'text')
        .addColumn('transfer_transaction_id', 'text')
        .addColumn('matched_transaction_id', 'text')
        .addColumn('import_id', 'text')
        .addColumn('import_payee_name', 'text')
        .addColumn('import_payee_name_original', 'text')
        .addColumn('debt_transaction_type', 'text')
        .addColumn('deleted', 'boolean', (col) => col.notNull())
        .addColumn('account_name', 'text', (col) => col.notNull())
        .addColumn('payee_name', 'text')
        .addColumn('category_name', 'text')
        .addColumn('subtransactions', 'jsonb', (col) => col.notNull())
        .addColumn('meta', 'jsonb', (col) => col.notNull())
        .execute();

    await db.schema
        .createTable('category_groups')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.notNull().primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('hidden', 'boolean', (col) => col.notNull())
        .addColumn('deleted', 'boolean', (col) => col.notNull())
        .execute();

    await db.schema
        .createTable('categories')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.notNull().primaryKey())
        .addColumn('category_group_id', 'text', (col) => col.notNull().references('category_groups.id'))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('hidden', 'boolean', (col) => col.notNull())
        .addColumn('deleted', 'boolean', (col) => col.notNull())
        .addColumn('note', 'text')
        .execute();

    await db.schema
        .createTable('metrics')
        .ifNotExists()
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('date', sql`timestamptz`, (col) => col.notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('value', 'numeric', (col) => col.notNull())
        .addColumn('meta', 'jsonb', (col) => col.notNull())
        .execute();

    await db.schema
        .createTable('categorization_feedback')
        .ifNotExists()
        .addColumn('id', 'serial', (col) => col.primaryKey())
        .addColumn('transaction_id', 'text', (col) => col.notNull())
        .addColumn('action', 'text', (col) => col.notNull())
        .addColumn('suggested_category', 'text')
        .addColumn('suggested_category_group', 'text')
        .addColumn('suggested_confidence', 'real')
        .addColumn('suggested_method', 'text')
        .addColumn('suggested_tier', 'text')
        .addColumn('chosen_category', 'text')
        .addColumn('chosen_category_group', 'text')
        .addColumn('chosen_category_id', 'text')
        .addColumn('proposal_snapshot', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('notes', 'text')
        .addColumn('created_at', sql`timestamptz`, (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    // Indexes. Kysely's index builder supports `.ifNotExists()`; the GIN expression indexes
    // on the JSON `meta` column are expressed as raw SQL because they index a JSON path, not
    // a plain column.
    await db.schema.createIndex('idx_metrics_date').ifNotExists().on('metrics').column('date').execute();
    await db.schema.createIndex('idx_metrics_name').ifNotExists().on('metrics').column('name').execute();
    await sql`CREATE INDEX IF NOT EXISTS idx_metrics_meta_account_id ON metrics USING GIN ((meta->'account_id'))`.execute(
        db,
    );
    await sql`CREATE INDEX IF NOT EXISTS idx_metrics_meta_account_name ON metrics USING GIN ((meta->'account_name'))`.execute(
        db,
    );

    await db.schema.createIndex('idx_ynab_date').ifNotExists().on('transactions').column('date').execute();
    await db.schema.createIndex('idx_ynab_cleared').ifNotExists().on('transactions').column('cleared').execute();
    await db.schema.createIndex('idx_ynab_approved').ifNotExists().on('transactions').column('approved').execute();
    await db.schema
        .createIndex('idx_transaction_account_name')
        .ifNotExists()
        .on('transactions')
        .column('account_name')
        .execute();
    await db.schema
        .createIndex('idx_transaction_payee_name')
        .ifNotExists()
        .on('transactions')
        .column('payee_name')
        .execute();
    await db.schema
        .createIndex('idx_transaction_category_name')
        .ifNotExists()
        .on('transactions')
        .column('category_name')
        .execute();

    await db.schema
        .createIndex('idx_category_group_id')
        .ifNotExists()
        .on('categories')
        .column('category_group_id')
        .execute();
    await db.schema.createIndex('idx_category_hidden').ifNotExists().on('categories').column('hidden').execute();
    await db.schema.createIndex('idx_category_deleted').ifNotExists().on('categories').column('deleted').execute();
    await db.schema.createIndex('idx_category_name').ifNotExists().on('categories').column('name').execute();

    await db.schema
        .createIndex('idx_category_group_hidden')
        .ifNotExists()
        .on('category_groups')
        .column('hidden')
        .execute();
    await db.schema
        .createIndex('idx_category_group_deleted')
        .ifNotExists()
        .on('category_groups')
        .column('deleted')
        .execute();
    await db.schema.createIndex('idx_category_group_name').ifNotExists().on('category_groups').column('name').execute();

    await db.schema
        .createIndex('idx_categorization_feedback_transaction')
        .ifNotExists()
        .on('categorization_feedback')
        .column('transaction_id')
        .execute();
    await db.schema
        .createIndex('idx_categorization_feedback_created')
        .ifNotExists()
        .on('categorization_feedback')
        .column('created_at')
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    // Drop in FK-safe order. `categories` references `category_groups`.
    await db.schema.dropTable('categorization_feedback').ifExists().execute();
    await db.schema.dropTable('metrics').ifExists().execute();
    await db.schema.dropTable('categories').ifExists().execute();
    await db.schema.dropTable('category_groups').ifExists().execute();
    await db.schema.dropTable('transactions').ifExists().execute();
    await db.schema.dropTable('tracking').ifExists().execute();
}
