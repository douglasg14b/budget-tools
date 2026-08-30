import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import { getReceiptsDir } from '../../../environment';
import { assertReceiptWritesAllowed } from '../assertReceiptWritesAllowed';
import type { ReceiptExtractStatus, ReceiptsTable } from './receiptsSchema';

export type ReceiptRow = ReceiptsTable;

export type InsertReceiptOriginalInput = {
    readonly bytes: Buffer;
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

    const contentHash = contentHashOf(input.bytes);
    const existing = await findReceiptByContentHash(contentHash, database);
    if (existing) {
        return existing;
    }

    const id = randomUUID();
    const receiptsDir = input.receiptsDir ?? getReceiptsDir();
    await mkdir(receiptsDir, { recursive: true });
    const originalPath = join(receiptsDir, id);
    await writeFile(originalPath, input.bytes);

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
        await unlinkIfPresent(originalPath);
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
        await unlinkIfPresent(originalPath);
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
        throw new Error(`receipt not found: ${id}`);
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
        throw new Error(`receipt not found: ${id}`);
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
    await unlinkIfPresent(row.originalPath);
}
