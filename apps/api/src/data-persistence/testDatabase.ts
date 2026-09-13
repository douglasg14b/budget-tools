import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateToLatest } from '@budget-tools/db';
import { PGlite } from '@electric-sql/pglite';
import { PGliteDialect } from 'kysely-pglite-dialect';

import { FilesystemReceiptStorage } from '../features/receipts/storage/filesystemReceiptStorage';
import { getReceiptStorage, setReceiptStorageForTests } from '../features/receipts/storage/getReceiptStorage';
import type { AppDatabaseClient } from './database';
import { createAppDatabaseFromDialect } from './database';

/**
 * A fully-migrated, isolated Postgres database for tests, backed by in-process PGlite
 * (Postgres compiled to WASM — no Docker, no external server). Replaces the old per-test
 * SQLite file. Each call gets its own fresh database; call `close()` in `afterEach`.
 *
 * Also installs a temp-dir filesystem receipt storage provider so both the write path
 * (`insertReceiptOriginal`) and the read paths (`getReceiptStorage()`) resolve to the same
 * isolated directory. `receiptsDir` is exposed for tests that assert on the stored files.
 *
 * Schema is applied via the shared `@budget-tools/db` migrator, so tests exercise exactly the
 * migrations that run in production.
 */
export type TestAppDatabase = {
    readonly db: AppDatabaseClient;
    readonly receiptsDir: string;
    readonly storage: FilesystemReceiptStorage;
    readonly close: () => Promise<void>;
};

export async function createTestAppDatabase(): Promise<TestAppDatabase> {
    const pglite = new PGlite();
    const db = createAppDatabaseFromDialect(new PGliteDialect(pglite));

    await migrateToLatest(db);

    const receiptsDir = await mkdtemp(join(tmpdir(), 'api-receipts-'));
    const storage = new FilesystemReceiptStorage(receiptsDir);
    setReceiptStorageForTests(storage);

    return {
        db,
        receiptsDir,
        storage,
        // `db.destroy()` tears down the PGlite instance via the dialect's driver; closing the
        // PGlite again would throw "PGlite is closed".
        close: async () => {
            await db.destroy();
            setReceiptStorageForTests(undefined);
            await rm(receiptsDir, { recursive: true, force: true });
        },
    };
}

/** Re-export so tests can reference the active provider without importing the factory directly. */
export { getReceiptStorage };
