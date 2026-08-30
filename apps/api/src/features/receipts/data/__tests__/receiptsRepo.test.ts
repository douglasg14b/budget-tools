import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import { setOperatingMode } from '../../../operatingMode/data/operatingModeRepo';
import {
    deleteReceipt,
    findReceiptByContentHash,
    insertReceiptOriginal,
    setReceiptExtract,
    setReceiptTransactionId,
} from '../receiptsRepo';

describe('receiptsRepo', () => {
    let directory: string;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipts-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('refuses Practice inserts', async () => {
        await setOperatingMode('practice', database);
        await expect(
            insertReceiptOriginal({ bytes: jpegBytes, receiptsDir: join(directory, 'files') }, database),
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('writes a Live original and row, and dedupes identical bytes', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = join(directory, 'files');
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        expect(created.extractStatus).toBe('pending');
        expect(created.totalsDisagree).toBe(false);
        expect(created.transactionId).toBeNull();
        const onDisk = await readFile(created.originalPath);
        expect(onDisk.equals(jpegBytes)).toBe(true);

        const again = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        expect(again.id).toBe(created.id);

        const byHash = await findReceiptByContentHash(created.contentHash, database);
        expect(byHash?.id).toBe(created.id);

        const [first, second] = await Promise.all([
            insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database),
            insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database),
        ]);
        expect(first.id).toBe(created.id);
        expect(second.id).toBe(created.id);
    });

    it('updates extract and bind in Live, and refuses Practice updates', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, receiptsDir: join(directory, 'files') },
            database,
        );
        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'gated',
                extractJson: '{"vendor":"Store"}',
                rawText: 'Store',
                vendor: 'Store',
                purchaseDate: '2026-08-29',
                printedMilliunits: 1234,
                totalsDisagree: true,
            },
            database,
        );
        await setReceiptTransactionId(created.id, 'txn-1', database);
        const updated = await findReceiptByContentHash(created.contentHash, database);
        expect(updated?.extractStatus).toBe('gated');
        expect(updated?.vendor).toBe('Store');
        expect(updated?.printedMilliunits).toBe(1234);
        expect(updated?.totalsDisagree).toBe(true);
        expect(updated?.transactionId).toBe('txn-1');

        await setOperatingMode('practice', database);
        await expect(
            setReceiptExtract(
                created.id,
                {
                    extractStatus: 'failed',
                    extractJson: null,
                    rawText: null,
                    vendor: null,
                    purchaseDate: null,
                    printedMilliunits: null,
                    totalsDisagree: false,
                },
                database,
            ),
        ).rejects.toMatchObject({ statusCode: 403 });
        await expect(setReceiptTransactionId(created.id, null, database)).rejects.toMatchObject({ statusCode: 403 });

        await setOperatingMode('live', database);
        await expect(
            setReceiptExtract(
                'missing-receipt',
                {
                    extractStatus: 'failed',
                    extractJson: null,
                    rawText: null,
                    vendor: null,
                    purchaseDate: null,
                    printedMilliunits: null,
                    totalsDisagree: false,
                },
                database,
            ),
        ).rejects.toThrow(/receipt not found/);
    });

    it('deletes the file and row in Live', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = join(directory, 'files');
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        await deleteReceipt(created.id, database);
        await expect(readFile(created.originalPath)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await findReceiptByContentHash(created.contentHash, database)).toBeUndefined();
    });
});
