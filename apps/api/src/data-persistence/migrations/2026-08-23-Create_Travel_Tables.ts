import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('travel_windows')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('kind', 'text', (col) => col.notNull().check(sql`kind IN ('vacation', 'work')`))
        .addColumn('start_date', 'text', (col) => col.notNull())
        .addColumn('end_date', 'text', (col) => col.notNull())
        .addColumn('account_id', 'text')
        .addColumn('account_name', 'text')
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addColumn('updated_at', 'text', (col) => col.notNull())
        .addCheckConstraint('travel_windows_dates', sql`start_date <= end_date`)
        .execute();

    await db.schema.createIndex('travel_windows_start_date_idx').on('travel_windows').column('start_date').execute();

    await db.schema
        .createTable('travel_bias_config')
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
        .execute();

    await sql`INSERT INTO travel_bias_config (id, enabled) VALUES (1, 1)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('travel_windows').execute();
    await db.schema.dropTable('travel_bias_config').execute();
}
