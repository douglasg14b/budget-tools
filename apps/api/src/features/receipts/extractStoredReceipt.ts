import type { AppDatabaseClient } from '../../data-persistence/database';
import { OPENROUTER_RECEIPT_RETRY_MODEL } from '../../environment';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import type { ReceiptRow } from './data/receiptsRepo';
import {
    deleteReceipt,
    listPendingExtractReceipts,
    readReceiptExtractFrameBytes,
    requireReceipt,
    setReceiptExtract,
} from './data/receiptsRepo';
import type { ExtractFramesFn, ReceiptExtractComplete } from './extractReceipt';
import { buildFailedReceiptExtract, extractReceipt } from './extractReceipt';
import { parseReceiptExtract } from './parseReceiptExtract';

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
 * Reviewer-requested extraction for an incomplete receipt. Both passes use the
 * configured frontier vision model; ordinary receipt captures retain the cheaper
 * header-plus-repair pipeline.
 */
export async function extractStoredReceiptWithStrongerModel(id: string, db?: AppDatabaseClient): Promise<void> {
    return extractStoredReceipt(id, db, (input) =>
        extractReceipt({
            ...input,
            headerModel: OPENROUTER_RECEIPT_RETRY_MODEL,
            repairModel: OPENROUTER_RECEIPT_RETRY_MODEL,
        }),
    );
}

/** Re-reads a missing payee/header with the stronger model and preserves existing lines. */
export async function extractStoredReceiptHeaderWithStrongerModel(id: string, db?: AppDatabaseClient): Promise<void> {
    const row = await requireReceipt(id, db);
    try {
        const frames = await readReceiptExtractFrameBytes(id, db);
        const result = await extractReceipt({
            frames,
            headerOnly: true,
            headerModel: OPENROUTER_RECEIPT_RETRY_MODEL,
        });
        if (result.kind === 'amazon') {
            await preserveHeaderRetryFailure(id, row, db);
            return;
        }
        const previous = parseReceiptExtract(row.extractJson);
        const vendor = result.vendor ?? row.vendor;
        const purchaseDate = result.purchaseDate ?? row.purchaseDate;
        const printedMilliunits = result.printedMilliunits ?? row.printedMilliunits;
        const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
        await setReceiptExtract(
            id,
            {
                extractStatus: !hasKeys ? 'failed' : previous?.gated && !row.totalsDisagree ? 'gated' : 'ungated',
                extractJson: JSON.stringify({
                    ...(previous ?? emptyExtractPayload()),
                    headerPrintedMilliunits: result.printedMilliunits ?? previous?.headerPrintedMilliunits ?? null,
                    error: parseReceiptExtract(result.extractJson)?.error ?? null,
                }),
                rawText: row.rawText,
                vendor,
                purchaseDate,
                printedMilliunits,
                totalsDisagree: row.totalsDisagree,
                extractCostUsd: sumNullable(row.extractCostUsd, result.extractCostUsd),
                extractPromptTokens: sumNullable(row.extractPromptTokens, result.extractPromptTokens),
                extractCompletionTokens: sumNullable(row.extractCompletionTokens, result.extractCompletionTokens),
            },
            db,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('receipt header retry failed', { id, message });
        await preserveHeaderRetryFailure(id, row, db);
    }
}

async function preserveHeaderRetryFailure(id: string, row: ReceiptRow, db?: AppDatabaseClient): Promise<void> {
    await setReceiptExtract(
        id,
        {
            extractStatus: 'failed',
            extractJson: row.extractJson,
            rawText: row.rawText,
            vendor: row.vendor,
            purchaseDate: row.purchaseDate,
            printedMilliunits: row.printedMilliunits,
            totalsDisagree: row.totalsDisagree,
            extractCostUsd: row.extractCostUsd,
            extractPromptTokens: row.extractPromptTokens,
            extractCompletionTokens: row.extractCompletionTokens,
        },
        db,
    );
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

function emptyExtractPayload() {
    return {
        repaired: false,
        gated: false,
        headerPrintedMilliunits: null,
        ocrPrintedMilliunits: null,
        taxMilliunits: 0,
        discountMilliunits: 0,
        lines: [],
    };
}

function sumNullable(left: number | null, right: number | null): number | null {
    if (left == null && right == null) {
        return null;
    }
    return (left ?? 0) + (right ?? 0);
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
            extractCostUsd: result.extractCostUsd,
            extractPromptTokens: result.extractPromptTokens,
            extractCompletionTokens: result.extractCompletionTokens,
        },
        db,
    );
}
