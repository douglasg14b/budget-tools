import { createRequire } from 'node:module';

/**
 * Loads Node's built-in `node:sqlite`, used only by the one-time SQLite → Postgres data migration.
 *
 * It is required rather than imported because Vite (and therefore Vitest) ships a builtin-module
 * list that predates `node:sqlite`: a static `import` gets rewritten to a bare `sqlite` specifier
 * and fails to resolve. Going through `createRequire` keeps the module opaque to the bundler and
 * hands the resolution to Node, which provides it natively on 22+.
 */

/** The slice of the `node:sqlite` surface this migration needs. */
export type LegacyStatement = {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
};

export type LegacyDatabase = {
    prepare(sql: string): LegacyStatement;
    close(): void;
};

type DatabaseSyncConstructor = new (path: string, options?: { readOnly?: boolean }) => LegacyDatabase;

export function openLegacySqlite(path: string, options?: { readOnly?: boolean }): LegacyDatabase {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: DatabaseSyncConstructor };
    // `DatabaseSync` rejects an explicitly-passed `undefined` options argument.
    return options ? new DatabaseSync(path, options) : new DatabaseSync(path);
}
