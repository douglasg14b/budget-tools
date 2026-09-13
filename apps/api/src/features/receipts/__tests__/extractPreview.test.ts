import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { listReceipts } from '../data/receiptsRepo';
import { extractPreview } from '../extractPreview';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import { MAX_RECEIPT_FRAMES } from '../receiptLimits';

describe('extractPreview', () => {
    let directory: string;
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipt-preview-'));
        appDb = await createTestAppDatabase();
        database = appDb.db;
        await setOperatingMode('practice', database);
    });

    afterEach(async () => {
        await appDb.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('rejects an empty frames list', async () => {
        await expect(extractPreview({ frames: [] })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects more than MAX_RECEIPT_FRAMES frames', async () => {
        const frames = Array.from({ length: MAX_RECEIPT_FRAMES + 1 }, () =>
            jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff])),
        );
        await expect(extractPreview({ frames })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('returns extract without writing SQLite rows or files', async () => {
        const receiptsDir = join(directory, 'files');
        const result = await extractPreview({ frames: [jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff]))] }, async () => ({
            kind: 'complete',
            extractStatus: 'ungated',
            vendor: 'Cafe Rio',
            purchaseDate: '2026-08-01',
            printedMilliunits: 8120,
            totalsDisagree: false,
            extractJson: '{"gated":false}',
            rawText: 'Cafe Rio',
        }));
        expect(result).toMatchObject({
            droppedAsAmazon: false,
            extractStatus: 'ungated',
            vendor: 'Cafe Rio',
            printedMilliunits: 8120,
        });
        expect(await listReceipts(database)).toEqual([]);
        await expect(readdir(receiptsDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('drops Amazon vendor without a stored extract status', async () => {
        const result = await extractPreview({ frames: [jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff]))] }, async () => ({
            kind: 'amazon',
        }));
        expect(result).toEqual({
            droppedAsAmazon: true,
            extractStatus: null,
            vendor: null,
            purchaseDate: null,
            printedMilliunits: null,
            totalsDisagree: false,
            extractJson: null,
            rawText: null,
        });
        expect(await listReceipts(database)).toEqual([]);
    });

    it('uses processed bytes for vision input when provided', async () => {
        const original = jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
        const extra = jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]));
        const processedBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x44]);
        let seen: Buffer | undefined;
        await extractPreview(
            { frames: [original, extra], processed: jpegDataUrl(processedBytes) },
            async ({ frames }) => {
                seen = frames[0];
                expect(frames).toHaveLength(1);
                return {
                    kind: 'complete',
                    extractStatus: 'ungated',
                    vendor: 'Store',
                    purchaseDate: '2026-08-01',
                    printedMilliunits: 1000,
                    totalsDisagree: false,
                    extractJson: '{}',
                    rawText: 'Store',
                };
            },
        );
        expect(seen?.equals(processedBytes)).toBe(true);
    });
});
