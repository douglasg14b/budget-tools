import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE travel_windows ADD COLUMN location TEXT`.execute(db);

    await db.schema
        .createTable('travel_window_accounts')
        .addColumn('window_id', 'text', (col) => col.notNull())
        .addColumn('account_id', 'text', (col) => col.notNull())
        .addColumn('account_name', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('travel_window_accounts_pk', ['window_id', 'account_id'])
        .execute();

    await sql`
        INSERT INTO travel_window_accounts (window_id, account_id, account_name)
        SELECT id, account_id, COALESCE(account_name, account_id)
        FROM travel_windows
        WHERE account_id IS NOT NULL AND TRIM(account_id) != ''
    `.execute(db);

    await sql`ALTER TABLE travel_windows DROP COLUMN account_id`.execute(db);
    await sql`ALTER TABLE travel_windows DROP COLUMN account_name`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE travel_windows ADD COLUMN account_id TEXT`.execute(db);
    await sql`ALTER TABLE travel_windows ADD COLUMN account_name TEXT`.execute(db);

    await sql`
        UPDATE travel_windows
        SET
            account_id = (
                SELECT account_id FROM travel_window_accounts
                WHERE travel_window_accounts.window_id = travel_windows.id
                ORDER BY account_id
                LIMIT 1
            ),
            account_name = (
                SELECT account_name FROM travel_window_accounts
                WHERE travel_window_accounts.window_id = travel_windows.id
                ORDER BY account_id
                LIMIT 1
            )
    `.execute(db);

    await db.schema.dropTable('travel_window_accounts').execute();
    await sql`ALTER TABLE travel_windows DROP COLUMN location`.execute(db);
}
