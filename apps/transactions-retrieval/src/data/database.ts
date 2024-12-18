import pg from 'pg';
const { Pool } = pg;
import { Kysely, PostgresDialect } from 'kysely';

import { DB_CONNECTION_STRING } from '../environment';
import type { Database } from './schema';

const dialect = new PostgresDialect({
    pool: new Pool({
        connectionString: DB_CONNECTION_STRING,
        max: 10,
    }),
});

export type DatabaseClient = Kysely<Database>;
export const database = new Kysely<Database>({
    dialect,
});
