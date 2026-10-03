import type { DatabaseClient } from '@budget-tools/db';
import { createDatabase } from '@budget-tools/db';

import { getDbConnectionString } from '../environment';

let database: DatabaseClient | undefined;

/**
 * Shared Kysely client. Created on first use so codegen and unit tests can import modules without Postgres.
 */
export function getDatabase(): DatabaseClient {
    if (!database) {
        database = createDatabase({ connectionString: getDbConnectionString() });
    }
    return database;
}

/** Points the core client at a test database (PGlite); `undefined` restores lazy creation. */
export function setDatabaseForTests(client: DatabaseClient | undefined): void {
    database = client;
}
