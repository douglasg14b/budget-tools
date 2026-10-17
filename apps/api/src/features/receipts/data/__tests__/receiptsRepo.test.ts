import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createTestAppDatabase } from '../../../../data-persistence/testDatabase';
import { setOperatingMode } from '../../../operatingMode/data/operatingModeRepo';
import { RECEIPT_THUMB_WIDTH } from '../../renderReceiptThumb';
import { originalRef, thumbRef } from '../../storage/receiptStorage';
import {
    deleteReceipt,
    findReceiptByContentHash,
    hasReceiptProcessed,
    insertReceiptOriginal,
    listReceipts,
    listReceiptsInPurchaseDateWindow,
    listReceiptsPage,
    readReceiptExtractFrameBytes,
    readReceiptImageBytes,
    readReceiptProcessedBytes,
    setReceiptExtract,
    setReceiptTransactionId,
} from '../receiptsRepo';

describe('receiptsRepo', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const processedBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x20]);

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('refuses Practice inserts', async () => {
        await setOperatingMode('practice', database);
        await expect(
            insertReceiptOriginal({ bytes: jpegBytes, receiptsDir: appDb.receiptsDir }, database),
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('writes a Live original and row, and dedupes identical bytes', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        expect(created.extractStatus).toBe('pending');
        expect(created.totalsDisagree).toBe(false);
        expect(created.transactionId).toBeNull();
        const onDisk = await appDb.storage.get(originalRef(created.id, 0));
        expect(onDisk?.equals(jpegBytes)).toBe(true);

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
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir: appDb.receiptsDir }, database);
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
        const receiptsDir = appDb.receiptsDir;
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        await deleteReceipt(created.id, database);
        expect(await appDb.storage.exists(originalRef(created.id, 0))).toBe(false);
        expect(await findReceiptByContentHash(created.contentHash, database)).toBeUndefined();
    });

    it('stores processed beside the original without changing the content hash', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, processed: processedBytes, receiptsDir },
            database,
        );
        expect(await hasReceiptProcessed(created.id)).toBe(true);
        const processed = await readReceiptProcessedBytes(created.id, database);
        expect(processed.bytes.equals(processedBytes)).toBe(true);
        expect(processed.contentType).toBe('image/jpeg');
        const extractFrames = await readReceiptExtractFrameBytes(created.id, database);
        expect(extractFrames).toHaveLength(1);
        expect(extractFrames[0]?.equals(processedBytes)).toBe(true);

        const again = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        expect(again.id).toBe(created.id);
        expect(again.contentHash).toBe(created.contentHash);

        await deleteReceipt(created.id, database);
        expect(await hasReceiptProcessed(created.id)).toBe(false);
    });

    it('does not overwrite an existing processed image on duplicate originals', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const firstProcessed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x21]);
        const secondProcessed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x22]);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, processed: firstProcessed, receiptsDir },
            database,
        );
        const again = await insertReceiptOriginal(
            { bytes: jpegBytes, processed: secondProcessed, receiptsDir },
            database,
        );
        expect(again.id).toBe(created.id);
        const stored = await readReceiptProcessedBytes(created.id, database);
        expect(stored.bytes.equals(firstProcessed)).toBe(true);
    });

    it('serves processed via the image variant used by GET', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, processed: processedBytes, receiptsDir: appDb.receiptsDir },
            database,
        );
        const processed = await readReceiptImageBytes(created.id, 'processed', 0, database);
        expect(processed.bytes.equals(processedBytes)).toBe(true);
        const original = await readReceiptImageBytes(created.id, 'original', 0, database);
        expect(original.bytes.equals(jpegBytes)).toBe(true);
        const withoutProcessed = await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x30]), receiptsDir: appDb.receiptsDir },
            database,
        );
        await expect(readReceiptImageBytes(withoutProcessed.id, 'processed', 0, database)).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it('uses original frames for extract when processed is missing', async () => {
        await setOperatingMode('live', database);
        const extra = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, extraFrames: [extra], receiptsDir: appDb.receiptsDir },
            database,
        );
        expect(await hasReceiptProcessed(created.id)).toBe(false);
        await expect(readReceiptProcessedBytes(created.id, database)).rejects.toMatchObject({ statusCode: 404 });
        const extractFrames = await readReceiptExtractFrameBytes(created.id, database);
        expect(extractFrames).toHaveLength(2);
        expect(extractFrames[0]?.equals(jpegBytes)).toBe(true);
        expect(extractFrames[1]?.equals(extra)).toBe(true);
    });

    it('lists receipts by indexed purchase date window', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const inWindow = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        const outside = await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]), receiptsDir },
            database,
        );
        await setReceiptExtract(
            inWindow.id,
            {
                extractStatus: 'gated',
                extractJson: null,
                rawText: null,
                vendor: 'Store',
                purchaseDate: '2026-02-09',
                printedMilliunits: 50000,
                totalsDisagree: false,
            },
            database,
        );
        await setReceiptExtract(
            outside.id,
            {
                extractStatus: 'gated',
                extractJson: null,
                rawText: null,
                vendor: 'Other',
                purchaseDate: '2026-01-01',
                printedMilliunits: 50000,
                totalsDisagree: false,
            },
            database,
        );
        const listed = await listReceiptsInPurchaseDateWindow('2026-02-05', '2026-02-11', database);
        expect(listed.map((row) => row.id)).toEqual([inWindow.id]);
    });

    it('does not merge two undecodable JPEG stubs', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const first = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        const second = await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]), receiptsDir },
            database,
        );
        expect(first.perceptualHash).toBeNull();
        expect(second.perceptualHash).toBeNull();
        expect(second.id).not.toBe(first.id);
    });

    it('reuses a row when originals differ but processed JPEGs match', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const processed = await solidJpeg({ r: 80, g: 80, b: 80 });
        const first = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 10, g: 10, b: 10 }),
                processed,
                receiptsDir,
            },
            database,
        );
        const again = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 240, g: 240, b: 240 }),
                processed,
                transactionId: 'txn-card',
                receiptsDir,
            },
            database,
        );
        expect(again.id).toBe(first.id);
        expect(again.transactionId).toBeNull();
        expect(first.perceptualHash).toHaveLength(64);
        expect(again.perceptualHash).toBe(first.perceptualHash);
    });

    it('hashes the original when processed is absent and ignores extra frames', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const original = await solidJpeg({ r: 40, g: 40, b: 40 });
        const extra = await solidJpeg({ r: 200, g: 10, b: 10 });
        const first = await insertReceiptOriginal({ bytes: original, receiptsDir }, database);
        const again = await insertReceiptOriginal({ bytes: original, extraFrames: [extra], receiptsDir }, database);
        expect(again.id).toBe(first.id);
    });

    it('inserts a second row when processed crops are far apart', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const first = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 10, g: 10, b: 10 }),
                processed: await solidJpeg({ r: 10, g: 10, b: 10 }),
                receiptsDir,
            },
            database,
        );
        const second = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 240, g: 240, b: 240 }),
                processed: await solidJpeg({ r: 240, g: 240, b: 240 }),
                receiptsDir,
            },
            database,
        );
        expect(second.id).not.toBe(first.id);
    });

    it('reuses the oldest in-tau neighbor', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const processed = await solidJpeg({ r: 80, g: 80, b: 80 });
        const older = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 10, g: 10, b: 10 }),
                processed,
                receiptsDir,
            },
            database,
        );
        const newer = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 240, g: 240, b: 240 }),
                processed: await solidJpeg({ r: 240, g: 240, b: 240 }),
                receiptsDir,
            },
            database,
        );
        await database
            .updateTable('receipts')
            .set({ perceptualHash: older.perceptualHash })
            .where('id', '=', newer.id)
            .execute();
        const again = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 30, g: 30, b: 30 }),
                processed,
                receiptsDir,
            },
            database,
        );
        expect(again.id).toBe(older.id);
    });

    it('does not re-pending a gated row on perceptual reuse', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const processed = await solidJpeg({ r: 80, g: 80, b: 80 });
        const created = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 10, g: 10, b: 10 }),
                processed,
                receiptsDir,
            },
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
                totalsDisagree: false,
            },
            database,
        );
        const again = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 240, g: 240, b: 240 }),
                processed,
                receiptsDir,
            },
            database,
        );
        expect(again.id).toBe(created.id);
        expect(again.extractStatus).toBe('gated');
    });

    it('backfills a null perceptual hash and reuses that row', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const processed = await solidJpeg({ r: 80, g: 80, b: 80 });
        const created = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 10, g: 10, b: 10 }),
                processed,
                receiptsDir,
            },
            database,
        );
        await database.updateTable('receipts').set({ perceptualHash: null }).where('id', '=', created.id).execute();
        const again = await insertReceiptOriginal(
            {
                bytes: await solidJpeg({ r: 240, g: 240, b: 240 }),
                processed,
                receiptsDir,
            },
            database,
        );
        expect(again.id).toBe(created.id);
        expect(again.perceptualHash).toEqual(created.perceptualHash);
    });

    it('does not merge distinct receipt fixture photos', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../__tests__/fixtures');
        const walmart = await insertReceiptOriginal(
            { bytes: await readFile(join(fixturesDir, 'walmart.jpg')), receiptsDir },
            database,
        );
        const saveMart = await insertReceiptOriginal(
            { bytes: await readFile(join(fixturesDir, 'save-mart.jpg')), receiptsDir },
            database,
        );
        expect(saveMart.id).not.toBe(walmart.id);
    });

    it('pages receipts newest first, breaking createdAt ties by id', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const ids: string[] = [];
        for (let index = 0; index < 5; index += 1) {
            const row = await insertReceiptOriginal(
                { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, index]), receiptsDir },
                database,
            );
            ids.push(row.id);
        }
        // Two rows share a timestamp so the id tie-break has to carry the page boundary.
        const createdAts = [
            '2026-03-01T00:00:00.000Z',
            '2026-03-02T00:00:00.000Z',
            '2026-03-02T00:00:00.000Z',
            '2026-03-03T00:00:00.000Z',
            '2026-03-04T00:00:00.000Z',
        ];
        for (const [index, id] of ids.entries()) {
            await database.updateTable('receipts').set({ createdAt: createdAts[index] }).where('id', '=', id).execute();
        }
        const expected = (await listReceipts(database)).map((row) => row.id);

        const seen: string[] = [];
        let page = await listReceiptsPage({ limit: 2 }, database);
        seen.push(...page.rows.map((row) => row.id));
        while (page.nextCursor) {
            page = await listReceiptsPage({ limit: 2, after: page.nextCursor }, database);
            seen.push(...page.rows.map((row) => row.id));
        }

        expect(seen).toEqual(expected);
        expect(new Set(seen).size).toBe(5);
        expect(seen[0]).toBe(ids[4]);
        expect(seen[4]).toBe(ids[0]);
    });

    it('pages a filter across receipts not loaded yet, newest first', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        const ids: string[] = [];
        for (let index = 0; index < 5; index += 1) {
            const row = await insertReceiptOriginal(
                { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x02, index]), receiptsDir },
                database,
            );
            ids.push(row.id);
            await database
                .updateTable('receipts')
                .set({
                    createdAt: `2026-04-0${index + 1}T00:00:00.000Z`,
                    // Even rows carry a reimbursable note; the badge reads the same key.
                    extractJson: JSON.stringify(
                        index % 2 === 0
                            ? { lines: [], reimbursable: { writtenText: 'Reimb', amountMilliunits: null } }
                            : { lines: [] },
                    ),
                })
                .where('id', '=', row.id)
                .execute();
        }
        await setReceiptTransactionId(ids[4] ?? '', 'txn-bound', database);

        const seen: string[] = [];
        let page = await listReceiptsPage({ limit: 1, filter: { reimbursable: true } }, database);
        seen.push(...page.rows.map((row) => row.id));
        while (page.nextCursor) {
            page = await listReceiptsPage(
                { limit: 1, after: page.nextCursor, filter: { reimbursable: true } },
                database,
            );
            seen.push(...page.rows.map((row) => row.id));
        }
        expect(seen).toEqual([ids[4], ids[2], ids[0]]);

        const unbound = await listReceiptsPage(
            { limit: 10, filter: { reimbursable: true, bound: 'unbound' } },
            database,
        );
        expect(unbound.rows.map((row) => row.id)).toEqual([ids[2], ids[0]]);
        expect(unbound.nextCursor).toBeNull();
    });

    it('reports no next page when the last page is exactly full', async () => {
        await setOperatingMode('live', database);
        const receiptsDir = appDb.receiptsDir;
        await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir }, database);
        await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11]), receiptsDir },
            database,
        );
        const page = await listReceiptsPage({ limit: 2 }, database);
        expect(page.rows).toHaveLength(2);
        expect(page.nextCursor).toBeNull();
    });

    it('renders a small thumbnail once, from processed when present, and deletes it with the receipt', async () => {
        await setOperatingMode('live', database);
        const original = await sharp({
            create: { width: 1200, height: 3000, channels: 3, background: { r: 240, g: 240, b: 240 } },
        })
            .jpeg()
            .toBuffer();
        const processed = await sharp({
            create: { width: 900, height: 2400, channels: 3, background: { r: 250, g: 250, b: 250 } },
        })
            .jpeg()
            .toBuffer();
        const created = await insertReceiptOriginal(
            { bytes: original, processed, receiptsDir: appDb.receiptsDir },
            database,
        );

        const thumb = await readReceiptImageBytes(created.id, 'thumb', 0, database);
        expect(thumb.contentType).toBe('image/jpeg');
        const meta = await sharp(thumb.bytes).metadata();
        expect(meta.width).toBe(RECEIPT_THUMB_WIDTH);
        expect(meta.height).toBe(640);
        expect(thumb.bytes.length).toBeLessThan(processed.length);

        const stored = await appDb.storage.get(thumbRef(created.id));
        expect(stored?.equals(thumb.bytes)).toBe(true);
        const again = await readReceiptImageBytes(created.id, 'thumb', 0, database);
        expect(again.bytes.equals(thumb.bytes)).toBe(true);

        await deleteReceipt(created.id, database);
        expect(await appDb.storage.exists(thumbRef(created.id))).toBe(false);
    });

    it('serves the source bytes as the thumbnail when the image cannot be decoded', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal({ bytes: jpegBytes, receiptsDir: appDb.receiptsDir }, database);
        const thumb = await readReceiptImageBytes(created.id, 'thumb', 0, database);
        expect(thumb.bytes.equals(jpegBytes)).toBe(true);
        expect(await appDb.storage.exists(thumbRef(created.id))).toBe(false);
    });
});

async function solidJpeg(color: { r: number; g: number; b: number }): Promise<Buffer> {
    return sharp({
        create: { width: 32, height: 32, channels: 3, background: color },
    })
        .jpeg()
        .toBuffer();
}
