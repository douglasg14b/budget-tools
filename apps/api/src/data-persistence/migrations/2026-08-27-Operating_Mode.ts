import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('operating_mode')
        .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
        .addColumn('mode', 'text', (col) => col.notNull().check(sql`mode IN ('practice', 'live')`))
        .execute();

    await sql`INSERT INTO operating_mode (id, mode) VALUES (1, 'practice')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('operating_mode').execute();
}
