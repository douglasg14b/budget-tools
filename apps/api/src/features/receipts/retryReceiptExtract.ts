import type { AppDatabaseClient } from '../../data-persistence/database';
import { getAppDatabase } from '../../data-persistence/database';
import { ConflictError } from '../travelWindows/HttpError';
import { assertReceiptWritesAllowed } from './assertReceiptWritesAllowed';
import type { ReceiptRow } from './data/receiptsRepo';
import { requireReceipt, resetFailedReceiptExtract } from './data/receiptsRepo';

export type ReceiptRetryKind = 'normal' | 'stronger' | 'header';

export type ReceiptRetry = {
    readonly row: ReceiptRow;
    readonly kind: ReceiptRetryKind;
};

/**
 * Failed extracts retry on the normal pipeline. A receipt with only its payee missing
 * uses the stronger model for its header alone, preserving existing line items.
 * A reviewer can retry a completed extract with the stronger model.
 */
export async function retryReceiptExtract(id: string, db?: AppDatabaseClient): Promise<ReceiptRetry> {
    const current = await requireReceipt(id, db);
    if (current.extractStatus === 'failed') {
        if (current.vendor == null && current.purchaseDate != null && current.printedMilliunits != null) {
            return { row: await markHeaderRetryPending(id, db), kind: 'header' };
        }
        return { row: await resetFailedReceiptExtract(id, db), kind: 'normal' };
    }
    if (current.extractStatus === 'gated' || current.extractStatus === 'ungated') {
        return { row: await resetCompletedReceiptExtract(id, db), kind: 'stronger' };
    }
    throw new ConflictError('Receipt extraction is already pending');
}

async function markHeaderRetryPending(id: string, db?: AppDatabaseClient): Promise<ReceiptRow> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const result = await database
        .updateTable('receipts')
        .set({ extractStatus: 'pending' })
        .where('id', '=', id)
        .where('extractStatus', '=', 'failed')
        .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
        throw new ConflictError('Only failed receipt extracts can retry missing header keys');
    }
    return requireReceipt(id, database);
}

async function resetCompletedReceiptExtract(id: string, db?: AppDatabaseClient): Promise<ReceiptRow> {
    const database = db ?? (await getAppDatabase());
    await assertReceiptWritesAllowed(database);
    const result = await database
        .updateTable('receipts')
        .set({
            extractStatus: 'pending',
            extractJson: null,
            rawText: null,
            vendor: null,
            purchaseDate: null,
            printedMilliunits: null,
            totalsDisagree: false,
            extractCostUsd: null,
            extractPromptTokens: null,
            extractCompletionTokens: null,
        })
        .where('id', '=', id)
        .where('extractStatus', 'in', ['gated', 'ungated'])
        .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
        throw new ConflictError('Only completed receipt extracts can retry with a stronger model');
    }
    return requireReceipt(id, database);
}
