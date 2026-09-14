import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * Authentication tables: pre-provisioned users and their long-lived sessions.
 *
 * There is no signup flow — rows in `users` are created offline by
 * `pnpm --filter @budget-tools/api provision-user`, which prompts for a password and stores an
 * argon2id hash. `password_hash` therefore holds a full PHC-format argon2id string
 * (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), which embeds its own salt and parameters; there
 * is no separate salt column and no application-level pepper.
 *
 * `sessions.token_hash` stores a SHA-256 of the opaque cookie token, never the token itself, so a
 * database leak does not hand out live sessions. SHA-256 (not argon2) is deliberate here: the
 * token is 32 bytes of CSPRNG output, so it has no guessable structure to brute-force, and this
 * hash is computed on every single authenticated request.
 *
 * Dialect notes, matching the house style in the sibling migrations:
 * - Real instants (`created_at`, `expires_at`, …) are `timestamptz` so `pg` returns JS `Date`.
 * - `ifNotExists()` everywhere so a re-run against a partially-provisioned DB is safe.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('users')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('username', 'text', (col) => col.notNull().unique())
        .addColumn('password_hash', 'text', (col) => col.notNull())
        .addColumn('created_at', sql`timestamptz`, (col) => col.notNull())
        .addColumn('updated_at', sql`timestamptz`, (col) => col.notNull())
        .execute();

    // Logins look users up by username; the unique constraint already indexes it, but spell the
    // lowercase lookup out so case-insensitive matching stays index-backed.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))`.execute(db);

    await db.schema
        .createTable('sessions')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
        .addColumn('token_hash', 'text', (col) => col.notNull().unique())
        .addColumn('created_at', sql`timestamptz`, (col) => col.notNull())
        .addColumn('expires_at', sql`timestamptz`, (col) => col.notNull())
        .addColumn('last_used_at', sql`timestamptz`, (col) => col.notNull())
        .execute();

    // Deleting every session for a user (logout-everywhere, password change) and sweeping expired
    // rows are the two non-token access paths.
    await db.schema.createIndex('sessions_user_id_idx').ifNotExists().on('sessions').column('user_id').execute();

    await db.schema.createIndex('sessions_expires_at_idx').ifNotExists().on('sessions').column('expires_at').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('sessions').ifExists().execute();
    await db.schema.dropTable('users').ifExists().execute();
}
