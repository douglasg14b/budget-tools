import type { Kysely, Migration, MigrationProvider } from 'kysely';
import { Migrator } from 'kysely';

import type { AppDatabase } from './database';
import * as createTravelTables from './migrations/2026-08-23-Create_Travel_Tables';

/**
 * Explicit migration registry. Dynamic filesystem imports break on Windows paths
 * with spaces (Kysely's FileMigrationProvider has the same problem).
 * Add each new migration file here.
 */
export const MIGRATIONS: Record<string, Migration> = {
    '2026-08-23-Create_Travel_Tables': createTravelTables,
};

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return MIGRATIONS;
    }
}

export async function migrateToLatest(database: Kysely<AppDatabase>): Promise<void> {
    const migrator = new Migrator({
        db: database,
        provider: new StaticMigrationProvider(),
    });

    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
        if (result.status === 'Error') {
            throw new Error(`SQLite migration failed: ${result.direction} ${result.migrationName}`);
        }
    }

    if (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}
