import { createHash, randomUUID } from 'node:crypto';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import { HttpError, NotFoundError } from '../../travelWindows/HttpError';
import { assertReceiptWritesAllowed } from '../assertReceiptWritesAllowed';
import type { PerceptualNeighbor } from '../perceptualHash';
import { findNearestPerceptualMatch, perceptualHashOf } from '../perceptualHash';
import { FilesystemReceiptStorage } from '../storage/filesystemReceiptStorage';
import { getReceiptStorage } from '../storage/getReceiptStorage';
import type { ReceiptStorage } from '../storage/receiptStorage';
import { originalRef, processedRef } from '../storage/receiptStorage';
import type { ReceiptExtractStatus, ReceiptsTable } from './receiptsSchema';

export type ReceiptRow = ReceiptsTable;

export type InsertReceiptOriginalInput = {
    readonly bytes: Buffer;
    readonly extraFrames?: readonly Buffer[];
    readonly processed?: Buffer;
    readonly transactionId?: string | null;
    /** Test/legacy convenience: store to a filesystem provider rooted at this dir. */
    readonly receiptsDir?: string;
    /** Explicit storage provider override (takes precedence over `receiptsDir`). */
    readonly storage?: ReceiptStorage;
};

function contentHashOf(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
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

/** Resolves the storage provider for a write, honouring the test/legacy overrides. */
function resolveStorage(input: Pick<InsertReceiptOriginalInput, 'storage' | 'receiptsDir'>): ReceiptStorage {
    if (input.storage) {
        return input.storage;
    }
    if (input.receiptsDir) {
        return new FilesystemReceiptStorage(input.receiptsDir);
    }
    return getReceiptStorage();
}

async function writeProcessedIfAbsent(
    storage: ReceiptStorage,
    receiptId: string,
    processed: Buffer | undefined,
): Promise<void> {
    if (!processed || (await storage.exists(processedRef(receiptId)))) {
        return;
    }
    await storage.put(processedRef(receiptId), processed);
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
    // Postgres unique_violation is SQLSTATE 23505; pg exposes the offending constraint name.
    const constraintName = 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : '';
    const uniqueConstraint = code === '23505' || /duplicate key value|UNIQUE constraint failed/i.test(message);
    const targetsContentHash =
        constraintName.includes('content_hash') || message.includes('content_hash') || message.includes('contentHash');
    return uniqueConstraint && targetsContentHash;
}

export async function getReceiptById(id: string, db?: AppDatabaseClient): Promise<ReceiptRow | undefined> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function getReceiptByTransactionId(
    transactionId: string,
    db?: AppDatabaseClient,
): Promise<ReceiptRow | undefined> {
    const database = db ?? (await getAppDatabase());
    return database
        .selectFrom('receipts')
        .selectAll()
        .where('transactionId', '=', transactionId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst();
}

export async function listReceipts(db?: AppDatabaseClient): Promise<ReceiptRow[]> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().orderBy('createdAt', 'desc').execute();
}

/**
 * Rows whose extract never finished — used to resume after process restart.
 */
export async function listPendingExtractReceipts(db?: AppDatabaseClient): Promise<ReceiptRow[]> {
    const database = db ?? (await getAppDatabase());
    return database
        .selectFrom('receipts')
        .selectAll()
        .where('extractStatus', '=', 'pending')
        .orderBy('createdAt', 'asc')
        .orderBy('id', 'asc')
        .execute();
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

export async function hasReceiptProcessed(
    receiptId: string,
    storage: ReceiptStorage = getReceiptStorage(),
): Promise<boolean> {
    return storage.exists(processedRef(receiptId));
}

export async function countReceiptFrames(
    receiptId: string,
    storage: ReceiptStorage = getReceiptStorage(),
): Promise<number> {
    return storage.countFrames(receiptId);
}

/**
 * Original frame bytes in capture order. Processed extract must not use these; prep first.
 */
export async function readReceiptAllFrameBytes(id: string, db?: AppDatabaseClient): Promise<readonly Buffer[]> {
    await requireReceipt(id, db);
    const storage = getReceiptStorage();
    const count = await storage.countFrames(id);
    if (count === 0) {
        throw new NotFoundError(`receipt frames not found: ${id}`);
    }
    const frames: Buffer[] = [];
    for (let frameIndex = 0; frameIndex < count; frameIndex += 1) {
        const bytes = await storage.get(originalRef(id, frameIndex));
        if (!bytes) {
            throw new NotFoundError(`receipt frame not found: ${id} frame ${frameIndex}`);
        }
        frames.push(bytes);
    }
    return frames;
}

export async function readReceiptOriginalBytes(
    id: string,
    db?: AppDatabaseClient,
    frameIndex = 0,
): Promise<{ readonly bytes: Buffer; readonly contentType: ReceiptImageContentType }> {
    await requireReceipt(id, db);
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
        throw new HttpError(400, `receipt frame index is invalid: ${frameIndex}`);
    }
    const bytes = await getReceiptStorage().get(originalRef(id, frameIndex));
    if (!bytes) {
        throw new NotFoundError(`receipt frame not found: ${id} frame ${frameIndex}`);
    }
    return { bytes, contentType: sniffImageContentType(bytes) };
}

export async function readReceiptProcessedBytes(
    id: string,
    db?: AppDatabaseClient,
): Promise<{ readonly bytes: Buffer; readonly contentType: ReceiptImageContentType }> {
    await requireReceipt(id, db);
    const bytes = await getReceiptStorage().get(processedRef(id));
    if (!bytes) {
        throw new NotFoundError(`receipt processed image not found: ${id}`);
    }
    return { bytes, contentType: sniffImageContentType(bytes) };
}

export async function readReceiptExtractFrameBytes(id: string, db?: AppDatabaseClient): Promise<readonly Buffer[]> {
    await requireReceipt(id, db);
    const processed = await getReceiptStorage().get(processedRef(id));
    if (processed) {
        return [processed];
    }
    return readReceiptAllFrameBytes(id, db);
}

export type ReceiptImageVariant = 'original' | 'processed';

export async function readReceiptImageBytes(
    id: string,
    variant: ReceiptImageVariant,
    frameIndex = 0,
    db?: AppDatabaseClient,
): Promise<{ readonly bytes: Buffer; readonly contentType: ReceiptImageContentType }> {
    if (variant === 'processed') {
        return readReceiptProcessedBytes(id, db);
    }
    return readReceiptOriginalBytes(id, db, frameIndex);
}

export async function findReceiptByContentHash(
    contentHash: string,
    db?: AppDatabaseClient,
): Promise<ReceiptRow | undefined> {
    const database = db ?? (await getAppDatabase());
    return database.selectFrom('receipts').selectAll().where('contentHash', '=', contentHash).executeTakeFirst();
}

async function hashBytesForInsert(input: InsertReceiptOriginalInput): Promise<string | null> {
    try {
        return await perceptualHashOf(input.processed ?? input.bytes);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('receipt perceptual hash skipped', { message });
        return null;
    }
}

async function readHashSourceBytes(receiptId: string, storage: ReceiptStorage): Promise<Buffer> {
    const processed = await storage.get(processedRef(receiptId));
    if (processed) {
        return processed;
    }
    const original = await storage.get(originalRef(receiptId, 0));
    if (!original) {
        throw new NotFoundError(`receipt frame not found: ${receiptId} frame 0`);
    }
    return original;
}

async function persistPerceptualHash(id: string, perceptualHash: string, database: AppDatabaseClient): Promise<void> {
    await database.updateTable('receipts').set({ perceptualHash }).where('id', '=', id).execute();
}

/**
 * Linear scan is intentional at household volume. Null hashes are backfilled here so older rows can still match.
 */
async function findPerceptualDuplicate(
    hash: string,
    database: AppDatabaseClient,
    storage: ReceiptStorage,
): Promise<ReceiptRow | undefined> {
    const rows = await database.selectFrom('receipts').selectAll().execute();
    const neighbors: PerceptualNeighbor[] = [];
    const byId = new Map<string, ReceiptRow>();
    for (const row of rows) {
        byId.set(row.id, row);
        let stored = row.perceptualHash;
        if (!stored) {
            try {
                stored = await perceptualHashOf(await readHashSourceBytes(row.id, storage));
                await persistPerceptualHash(row.id, stored, database);
                byId.set(row.id, { ...row, perceptualHash: stored });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error('receipt perceptual backfill skipped', { id: row.id, message });
                continue;
            }
        }
        neighbors.push({ id: row.id, createdAt: row.createdAt, perceptualHash: stored });
    }
    const match = findNearestPerceptualMatch(hash, neighbors);
    return match ? byId.get(match.id) : undefined;
}

export async function insertReceiptOriginal(
    input: InsertReceiptOriginalInput,
    db?: AppDatabaseClient,
): Promise<ReceiptRow> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const storage = resolveStorage(input);

    const extraFrames = input.extraFrames ?? [];
    const contentHash = contentHashOfFrames([input.bytes, ...extraFrames]);
    const existing = await findReceiptByContentHash(contentHash, database);
    if (existing) {
        await writeProcessedIfAbsent(storage, existing.id, input.processed);
        return existing;
    }

    const incomingHash = await hashBytesForInsert(input);
    if (incomingHash) {
        const duplicate = await findPerceptualDuplicate(incomingHash, database, storage);
        if (duplicate) {
            await writeProcessedIfAbsent(storage, duplicate.id, input.processed);
            return duplicate;
        }
    }

    const id = randomUUID();
    // `original_path` is retained (NOT NULL) as the receipt's logical storage key; the provider
    // derives physical object locations from the receipt id, so the key is just the id.
    const originalPath = id;
    await storage.put(originalRef(id, 0), input.bytes);
    try {
        for (const [extraIndex, frame] of extraFrames.entries()) {
            await storage.put(originalRef(id, extraIndex + 1), frame);
        }
        if (input.processed) {
            await storage.put(processedRef(id), input.processed);
        }
    } catch (error) {
        await storage.deleteAll(id);
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
                perceptualHash: incomingHash,
                totalsDisagree: false,
                extractCostUsd: null,
                extractPromptTokens: null,
                extractCompletionTokens: null,
            })
            .execute();
    } catch (error) {
        await storage.deleteAll(id);
        if (isReceiptContentHashConflict(error)) {
            const winner = await findReceiptByContentHash(contentHash, database);
            if (winner) {
                await writeProcessedIfAbsent(storage, winner.id, input.processed);
                return winner;
            }
        }
        throw error;
    }

    const row = await getReceiptById(id, database);
    if (!row) {
        await storage.deleteAll(id);
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
        readonly extractCostUsd?: number | null;
        readonly extractPromptTokens?: number | null;
        readonly extractCompletionTokens?: number | null;
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
            extractCostUsd: update.extractCostUsd ?? null,
            extractPromptTokens: update.extractPromptTokens ?? null,
            extractCompletionTokens: update.extractCompletionTokens ?? null,
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
    await getReceiptStorage().deleteAll(id);
}
