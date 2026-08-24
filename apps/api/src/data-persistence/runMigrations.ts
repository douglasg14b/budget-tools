import { getSqliteDbPath } from '../environment';
import { createAppDatabase } from './database';
import { migrateToLatest } from './migrate';

async function main(): Promise<void> {
    const sqlitePath = getSqliteDbPath();
    console.log(`Migrating API SQLite at ${sqlitePath}`);
    const database = createAppDatabase(sqlitePath);
    try {
        await migrateToLatest(database);
        console.log('API SQLite migrations complete');
    } finally {
        await database.destroy();
    }
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
