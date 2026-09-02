import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import type { ReceiptRow } from './data/receiptsRepo';
import {
    deleteReceipt,
    listPendingExtractReceipts,
    readReceiptExtractFrameBytes,
    setReceiptExtract,
} from './data/receiptsRepo';
import type { ExtractFramesFn, ReceiptExtractComplete } from './extractReceipt';
import { buildFailedReceiptExtract, extractReceipt } from './extractReceipt';

type DeleteReceiptFn = (id: string, db?: AppDatabaseClient) => Promise<void>;

export type ExtractStoredFn = (receiptId: string) => Promise<void>;

export type EnqueueReceiptExtractFn = (receiptId: string) => void;

const inFlightExtractIds = new Set<string>();

/**
 * Live extract against stored processed JPEG when present, otherwise originals. Amazon vendor deletes the row and files.
 * Failures persist extract_status failed with dumps; they do not invent match keys.
 * Amazon delete failures must not persist failed.
 */
export async function extractStoredReceipt(
    id: string,
    db?: AppDatabaseClient,
    extract: ExtractFramesFn = extractReceipt,
    remove: DeleteReceiptFn = deleteReceipt,
): Promise<void> {
    try {
        const frames = await readReceiptExtractFrameBytes(id, db);
        const result = await extract({ frames });
        if (result.kind === 'amazon') {
            try {
                await remove(id, db);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error('receipt amazon delete failed', { id, message });
            }
            return;
        }
        await persistComplete(id, result, db);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('receipt extract failed', { id, message });
        try {
            await persistComplete(id, buildFailedReceiptExtract(message), db);
        } catch (persistError) {
            const persistMessage = persistError instanceof Error ? persistError.message : String(persistError);
            console.error('receipt extract status persist failed', { id, persistMessage });
        }
    }
}

/**
 * Kick in-process extract after Live create returns pending. Does not block the HTTP response.
 * Skips when the same receipt id is already running; clears the in-flight mark after extract settles.
 */
export function enqueueReceiptExtract(receiptId: string, extract: ExtractStoredFn = extractStoredReceipt): void {
    if (inFlightExtractIds.has(receiptId)) {
        return;
    }
    inFlightExtractIds.add(receiptId);
    setImmediate(() => {
        void extract(receiptId).finally(() => {
            inFlightExtractIds.delete(receiptId);
        });
    });
}

/**
 * Enqueue Live extract when create (or a duplicate hit) left the row pending.
 * @returns whether enqueue ran
 */
export function kickReceiptExtractIfPending(
    row: ReceiptRow,
    enqueue: EnqueueReceiptExtractFn = enqueueReceiptExtract,
): boolean {
    if (row.extractStatus !== 'pending') {
        return false;
    }
    enqueue(row.id);
    return true;
}

/**
 * Re-queue extracts that were still pending when the process last exited.
 * Practice does not enqueue.
 */
export async function sweepPendingReceiptExtracts(
    db?: AppDatabaseClient,
    enqueue: EnqueueReceiptExtractFn = enqueueReceiptExtract,
): Promise<void> {
    const mode = await getOperatingMode(db);
    if (mode !== 'live') {
        return;
    }
    const pending = await listPendingExtractReceipts(db);
    for (const row of pending) {
        enqueue(row.id);
    }
}

async function persistComplete(id: string, result: ReceiptExtractComplete, db?: AppDatabaseClient): Promise<void> {
    await setReceiptExtract(
        id,
        {
            extractStatus: result.extractStatus,
            extractJson: result.extractJson,
            rawText: result.rawText,
            vendor: result.vendor,
            purchaseDate: result.purchaseDate,
            printedMilliunits: result.printedMilliunits,
            totalsDisagree: result.totalsDisagree,
        },
        db,
    );
}
