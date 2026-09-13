import env from 'env-var';

import { createDatabase } from './createDatabase';
import { migrateToLatest } from './migrate';

/**
 * CLI entrypoint for the one-shot migrator. Reads `DB_CONNECTION_STRING`, applies all
 * pending migrations against the shared Postgres, then exits. This is the command the
 * `migrator` service in `docker-compose-prod.yml` runs before `api`/`transactions-retrieval`
 * start. Safe to run against an already-provisioned database (migrations are idempotent).
 */
async function main(): Promise<void> {
    const connectionString = env.get('DB_CONNECTION_STRING').required().asString();
    const database = createDatabase({ connectionString });

    try {
        console.log('Applying Budget Tools Postgres migrations…');
        const { results } = await migrateToLatest(database);

        const applied = (results ?? []).filter((result) => result.status === 'Success');
        if (applied.length === 0) {
            console.log('No pending migrations. Schema is up to date.');
        } else {
            for (const result of applied) {
                console.log(`Applied ${result.direction} ${result.migrationName}`);
            }
        }
        console.log('Migrations complete.');
    } finally {
        await database.destroy();
    }
}

void main().catch((error: unknown) => {
    console.error('Migration run failed:', error);
    process.exit(1);
});
