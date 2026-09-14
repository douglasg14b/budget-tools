import type { Kysely, Migration, MigrationProvider, MigrationResultSet } from 'kysely';
import { Migrator } from 'kysely';

import * as apiAppTables from './migrations/2026-09-11-Api_App_Tables';
import * as coreYnabTables from './migrations/2026-09-11-Core_Ynab_Tables';
import * as authTables from './migrations/2026-09-13-Auth_Tables';

/**
 * Explicit migration registry for the shared Budget Tools Postgres schema.
 *
 * Dynamic filesystem imports break on Windows paths with spaces (Kysely's
 * FileMigrationProvider has the same problem), so migrations are registered by hand.
 * Add each new migration file here, keyed by its date-prefixed name so ordering is stable.
 */
export const MIGRATIONS: Record<string, Migration> = {
    '2026-09-11-Core_Ynab_Tables': coreYnabTables,
    '2026-09-11-Api_App_Tables': apiAppTables,
    '2026-09-13-Auth_Tables': authTables,
};

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return MIGRATIONS;
    }
}

/**
 * Applies all pending migrations against the given Postgres client. Throws on the first
 * failed migration so callers (the one-shot migrator container, tests) fail loud.
 *
 * Generic over the client's schema so a typed `DatabaseClient` can be passed directly;
 * the Migrator itself operates on the schema-agnostic `Kysely` surface.
 */
export async function migrateToLatest<DB>(database: Kysely<DB>): Promise<MigrationResultSet> {
    const migrator = new Migrator({
        db: database,
        provider: new StaticMigrationProvider(),
    });

    const resultSet = await migrator.migrateToLatest();
    const { error, results } = resultSet;

    for (const result of results ?? []) {
        if (result.status === 'Error') {
            throw new Error(`Postgres migration failed: ${result.direction} ${result.migrationName}`);
        }
    }

    if (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }

    return resultSet;
}
