import pg from 'pg';
const { Pool } = pg;
import { Kysely, PostgresDialect } from 'kysely';
import { Database } from './schema';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from '../environment';

const dialect = new PostgresDialect({
    pool: new Pool({
        database: DB_NAME,
        host: DB_HOST,
        password: DB_PASSWORD,
        user: DB_USER,
        port: DB_PORT,
        max: 10,
    }),
});

export type DatabaseClient = Kysely<Database>;
export const database = new Kysely<Database>({
    dialect,
});
