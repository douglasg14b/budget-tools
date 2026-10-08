import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { Database } from './schema';
import { assertNotInTestRun } from './testGuard';

const { Pool } = pg;

export type DatabaseClient = Kysely<Database>;

type CreateDatabaseInput = {
    readonly connectionString: string;
};

/**
 * Creates a Kysely client against the shared Budget Tools Postgres schema.
 */
export function createDatabase({ connectionString }: CreateDatabaseInput): DatabaseClient {
    assertNotInTestRun('open a Postgres connection pool');
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString,
                max: 10,
            }),
        }),
    });
}
