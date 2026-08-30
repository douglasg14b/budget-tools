import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import { getReceiptsDir } from '../../../environment';
import { HttpError, NotFoundError } from '../../travelWindows/HttpError';
import { assertReceiptWritesAllowed } from '../assertReceiptWritesAllowed';
import type { ReceiptExtractStatus, ReceiptsTable } from './receiptsSchema';

export type ReceiptRow = ReceiptsTable;

export type InsertReceiptOriginalInput = {
    readonly bytes: Buffer;
    readonly extraFrames?: readonly Buffer[];
    readonly transactionId?: string | null;
    readonly receiptsDir?: string;
};

function contentHashOf(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

async function unlinkIfPresent(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        if (errno.code !== 'ENOENT') {
            throw error;
        }
    }
}

function contentHashOfFrames(frames: readonly Buffer[]): string {
    const only = frames[0];
    if (frames.length === 1 && only) {
        return contentHashOf(only);
    }
    const hash = createHash('sha256');
    hash.update(`frames:${frames.length}:`);
    for (const frame of frames) {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(frame.length);
        hash.update(length);
        hash.update(frame);
    }
    return hash.digest('hex');
}

async function unlinkReceiptFiles(originalPath: string): Promise<void> {
    await unlinkIfPresent(originalPath);
    let index = 1;
    while (true) {
        const extraPath = `${originalPath}.${index}`;
        try {
            await unlink(extraPath);
        } catch (error) {
            const errno = error as NodeJS.ErrnoException;
            if (errno.code === 'ENOENT') {
                return;
            }
            throw error;
        }
        index += 1;
    }
}

function extraFramePath(originalPath: string, extraIndex: number): string {
    return `${originalPath}.${extraIndex + 1}`;
}

function receiptFramePath(originalPath: string, frameIndex: number): string {
    return frameIndex === 0 ? originalPath : extraFramePath(originalPath, frameIndex - 1);
}

export type ReceiptImageContentType = 'image/jpeg' | 'image/png' | 'application/octet-stream';

function sniffImageContentType(bytes: Buffer): ReceiptImageContentType {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png';
    }
    return 'application/octet-stream';
}

function isReceiptContentHashConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    const message = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
    const uniqueConstraint = code.startsWith('SQLITE_CONSTRAINT') || /UNIQUE constraint failed/i.test(message);
    return uniqueConstraint && (message.includes('content_hash') || message.includes('contentHash'));
}

export async function getReceiptById(id: string, db?: AppDatabaseClient): Promise<ReceiptRow | undefined> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function listReceipts(db?: AppDatabaseClient): Promise<ReceiptRow[]> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().orderBy('createdAt', 'desc').execute();
}

/**
 * Indexed purchase-date window for Classify lookup. Null dates are excluded by the comparison.
 */
export async function listReceiptsInPurchaseDateWindow(
    earliestDate: string,
    latestDate: string,
    db?: AppDatabaseClient,
): Promise<ReceiptRow[]> {
    const database = db ?? (await getAppDatabase());
    return database
        .selectFrom('receipts')
        .selectAll()
        .where('purchaseDate', '>=', earliestDate)
        .where('purchaseDate', '<=', latestDate)
        .orderBy('purchaseDate', 'asc')
        .orderBy('id', 'asc')
        .execute();
}

export async function requireReceipt(id: string, db?: AppDatabaseClient): Promise<ReceiptRow> {
    const row = await getReceiptById(id, db);
    if (!row) {
        throw new NotFoundError(`receipt not found: ${id}`);
    }
    return row;
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        if (errno.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

export async function countReceiptFrames(originalPath: string): Promise<number> {
    if (!(await fileExists(originalPath))) {
        return 0;
    }
    let count = 1;
    while (await fileExists(`${originalPath}.${count}`)) {
        count += 1;
    }
    return count;
}

export async function readReceiptOriginalBytes(
    id: string,
    db?: AppDatabaseClient,
    frameIndex = 0,
): Promise<{ readonly bytes: Buffer; readonly contentType: ReceiptImageContentType }> {
    const row = await requireReceipt(id, db);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
        throw new HttpError(400, `receipt frame index is invalid: ${frameIndex}`);
    }
    const framePath = receiptFramePath(row.originalPath, frameIndex);
    try {
        const bytes = await readFile(framePath);
        return { bytes, contentType: sniffImageContentType(bytes) };
    } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        if (errno.code === 'ENOENT') {
            throw new NotFoundError(`receipt frame not found: ${id} frame ${frameIndex}`);
        }
        throw error;
    }
}

export async function findReceiptByContentHash(
    contentHash: string,
    db?: AppDatabaseClient,
): Promise<ReceiptRow | undefined> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().where('contentHash', '=', contentHash).executeTakeFirst();
}

export async function insertReceiptOriginal(
    input: InsertReceiptOriginalInput,
    db?: AppDatabaseClient,
): Promise<ReceiptRow> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);

    const extraFrames = input.extraFrames ?? [];
    const contentHash = contentHashOfFrames([input.bytes, ...extraFrames]);
    const existing = await findReceiptByContentHash(contentHash, database);
    if (existing) {
        return existing;
    }

    const id = randomUUID();
    const receiptsDir = input.receiptsDir ?? getReceiptsDir();
    await mkdir(receiptsDir, { recursive: true });
    const originalPath = join(receiptsDir, id);
    await writeFile(originalPath, input.bytes);
    try {
        for (const [extraIndex, frame] of extraFrames.entries()) {
            await writeFile(extraFramePath(originalPath, extraIndex), frame);
        }
    } catch (error) {
        await unlinkReceiptFiles(originalPath);
        throw error;
    }

    const createdAt = new Date().toISOString();
    try {
        await database
            .insertInto('receipts')
            .values({
                id,
                createdAt,
                vendor: null,
                purchaseDate: null,
                printedMilliunits: null,
                extractStatus: 'pending',
                extractJson: null,
                rawText: null,
                originalPath,
                transactionId: input.transactionId ?? null,
                contentHash,
                totalsDisagree: false,
            })
            .execute();
    } catch (error) {
        await unlinkReceiptFiles(originalPath);
        if (isReceiptContentHashConflict(error)) {
            const winner = await findReceiptByContentHash(contentHash, database);
            if (winner) {
                return winner;
            }
        }
        throw error;
    }

    const row = await getReceiptById(id, database);
    if (!row) {
        await unlinkReceiptFiles(originalPath);
        throw new Error(`receipt insert vanished: ${id}`);
    }
    return row;
}

export async function setReceiptExtract(
    id: string,
    update: {
        readonly extractStatus: ReceiptExtractStatus;
        readonly extractJson: string | null;
        readonly rawText: string | null;
        readonly vendor: string | null;
        readonly purchaseDate: string | null;
        readonly printedMilliunits: number | null;
        readonly totalsDisagree: boolean;
    },
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const result = await database
        .updateTable('receipts')
        .set({
            extractStatus: update.extractStatus,
            extractJson: update.extractJson,
            rawText: update.rawText,
            vendor: update.vendor,
            purchaseDate: update.purchaseDate,
            printedMilliunits: update.printedMilliunits,
            totalsDisagree: update.totalsDisagree,
        })
        .where('id', '=', id)
        .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError(`receipt not found: ${id}`);
    }
}

export async function setReceiptTransactionId(
    id: string,
    transactionId: string | null,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const result = await database
        .updateTable('receipts')
        .set({ transactionId })
        .where('id', '=', id)
        .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError(`receipt not found: ${id}`);
    }
}

export async function deleteReceipt(id: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const row = await getReceiptById(id, database);
    if (!row) {
        return;
    }
    await database.deleteFrom('receipts').where('id', '=', id).execute();
    await unlinkReceiptFiles(row.originalPath);
}
