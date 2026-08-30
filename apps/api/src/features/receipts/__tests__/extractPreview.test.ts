import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { listReceipts } from '../data/receiptsRepo';
import { extractPreview } from '../extractPreview';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import { MAX_RECEIPT_FRAMES } from '../receiptLimits';

describe('extractPreview', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipt-preview-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
        await setOperatingMode('practice', database);
    });

    afterEach(async () => {
        await database.destroy();
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
});
