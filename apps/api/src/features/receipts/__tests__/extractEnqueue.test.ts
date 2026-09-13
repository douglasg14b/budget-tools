import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { createReceipt } from '../createReceipt';
import type { ReceiptRow } from '../data/receiptsRepo';
import type { ReceiptExtractStatus } from '../data/receiptsSchema';
import { extractPreview } from '../extractPreview';
import {
    enqueueReceiptExtract,
    kickReceiptExtractIfPending,
    sweepPendingReceiptExtracts,
} from '../extractStoredReceipt';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import { MAX_RECEIPT_FRAMES } from '../receiptLimits';

function flushImmediate(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

function receiptRow(extractStatus: ReceiptExtractStatus, id = 'receipt-1'): ReceiptRow {
    return {
        id,
        createdAt: '2026-08-01T00:00:00.000Z',
        vendor: null,
        purchaseDate: null,
        printedMilliunits: null,
        extractStatus,
        extractJson: null,
        rawText: null,
        originalPath: '/tmp/receipt-1',
        transactionId: null,
        contentHash: 'abc',
        perceptualHash: null,
        totalsDisagree: false,
    };
}

describe('enqueueReceiptExtract', () => {
    it('skips a second enqueue while extract is in flight', async () => {
        const calls: string[] = [];
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const extract = (id: string) => {
            calls.push(id);
            return gate;
        };

        enqueueReceiptExtract('in-flight-1', extract);
        enqueueReceiptExtract('in-flight-1', extract);
        await flushImmediate();
        expect(calls).toEqual(['in-flight-1']);

        release();
        await gate;

        enqueueReceiptExtract('in-flight-1', extract);
        await flushImmediate();
        expect(calls).toEqual(['in-flight-1', 'in-flight-1']);
    });
});

describe('kickReceiptExtractIfPending', () => {
    it('enqueues once when the row is pending', () => {
        const enqueue = vi.fn();
        expect(kickReceiptExtractIfPending(receiptRow('pending'), enqueue)).toBe(true);
        expect(enqueue).toHaveBeenCalledOnce();
        expect(enqueue).toHaveBeenCalledWith('receipt-1');
    });

    it('does not enqueue gated or other statuses', () => {
        const enqueue = vi.fn();
        expect(kickReceiptExtractIfPending(receiptRow('gated'), enqueue)).toBe(false);
        expect(kickReceiptExtractIfPending(receiptRow('ungated'), enqueue)).toBe(false);
        expect(kickReceiptExtractIfPending(receiptRow('failed'), enqueue)).toBe(false);
        expect(enqueue).not.toHaveBeenCalled();
    });
});

describe('sweepPendingReceiptExtracts', () => {
    let directory: string;
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipt-sweep-'));
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('enqueues pending receipts in Live', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = join(directory, 'files');
        const first = await createReceipt({ frames: [jpegDataUrl(jpegBytes)], receiptsDir }, database);
        const second = await createReceipt(
            { frames: [jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]))], receiptsDir },
            database,
        );
        const enqueue = vi.fn();
        await sweepPendingReceiptExtracts(database, enqueue);
        expect(enqueue).toHaveBeenCalledTimes(2);
        expect(enqueue.mock.calls.map((call) => call[0]).sort()).toEqual([first.id, second.id].sort());
    });

    it('does not enqueue pending receipts in Practice', async () => {
        await setOperatingMode('live', database);
        await createReceipt({ frames: [jpegDataUrl(jpegBytes)], receiptsDir: join(directory, 'files') }, database);
        await setOperatingMode('practice', database);
        const enqueue = vi.fn();
        await sweepPendingReceiptExtracts(database, enqueue);
        expect(enqueue).not.toHaveBeenCalled();
    });
});

describe('MAX_RECEIPT_FRAMES', () => {
    let directory: string;
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipt-frames-'));
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('rejects oversized frame lists on create and extract-preview', async () => {
        await setOperatingMode('live', database);
        const frames = Array.from({ length: MAX_RECEIPT_FRAMES + 1 }, () =>
            jpegDataUrl(Buffer.from([0xff, 0xd8, 0xff])),
        );
        await expect(createReceipt({ frames, receiptsDir: join(directory, 'files') }, database)).rejects.toMatchObject({
            statusCode: 400,
        });
        await expect(extractPreview({ frames })).rejects.toMatchObject({ statusCode: 400 });
    });
});
