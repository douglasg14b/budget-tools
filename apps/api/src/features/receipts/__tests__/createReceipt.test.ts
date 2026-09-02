import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { createReceipt, decodeDataUrlFrame } from '../createReceipt';
import {
    findReceiptByContentHash,
    hasReceiptProcessed,
    readReceiptOriginalBytes,
    readReceiptProcessedBytes,
} from '../data/receiptsRepo';
import { MAX_RECEIPT_FRAMES } from '../receiptLimits';

function jpegDataUrl(bytes: Buffer): string {
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

describe('createReceipt', () => {
    let directory: string;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const secondFrame = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x11]);

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipts-http-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('rejects non-data-URL frames', () => {
        expect(() => decodeDataUrlFrame('not-a-data-url')).toThrow(/data URL/);
    });

    it('rejects invalid base64 payloads', () => {
        expect(() => decodeDataUrlFrame('data:image/jpeg;base64,???')).toThrow(/valid base64/);
    });

    it('rejects more than MAX_RECEIPT_FRAMES frames', async () => {
        await setOperatingMode('live', database);
        const frames = Array.from({ length: MAX_RECEIPT_FRAMES + 1 }, () => jpegDataUrl(jpegBytes));
        await expect(createReceipt({ frames, receiptsDir: join(directory, 'files') }, database)).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it('refuses Practice creates', async () => {
        await setOperatingMode('practice', database);
        await expect(
            createReceipt({ frames: [jpegDataUrl(jpegBytes)], receiptsDir: join(directory, 'files') }, database),
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('stores Live frames as one row and serves the first original', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = join(directory, 'files');
        const created = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes), jpegDataUrl(secondFrame)],
                transactionId: 'txn-card',
                receiptsDir,
            },
            database,
        );
        expect(created.transactionId).toBe('txn-card');
        expect(created.extractStatus).toBe('pending');
        const listed = await findReceiptByContentHash(created.contentHash, database);
        expect(listed?.id).toBe(created.id);
        const extra = await readFile(`${created.originalPath}.1`);
        expect(extra.equals(secondFrame)).toBe(true);
        const original = await readReceiptOriginalBytes(created.id, database);
        expect(original.contentType).toBe('image/jpeg');
        expect(original.bytes.equals(jpegBytes)).toBe(true);
        const second = await readReceiptOriginalBytes(created.id, database, 1);
        expect(second.bytes.equals(secondFrame)).toBe(true);

        const again = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes), jpegDataUrl(secondFrame)],
                receiptsDir,
            },
            database,
        );
        expect(again.id).toBe(created.id);
    });

    it('stores processed bytes separately from originals', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = join(directory, 'files');
        const processed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x22]);
        const created = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes)],
                processed: jpegDataUrl(processed),
                receiptsDir,
            },
            database,
        );
        expect(await hasReceiptProcessed(created.originalPath)).toBe(true);
        const original = await readReceiptOriginalBytes(created.id, database);
        expect(original.bytes.equals(jpegBytes)).toBe(true);
        const storedProcessed = await readReceiptProcessedBytes(created.id, database);
        expect(storedProcessed.bytes.equals(processed)).toBe(true);
    });
});
