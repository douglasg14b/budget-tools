import { randomUUID } from 'node:crypto';
import type { AppDatabaseClient } from '../../../data-persistence/database';
import { YNAB_FLUSH_BATCH_SIZE, YNAB_FLUSH_MIN_INTERVAL_MS } from '../../../environment';
import { HttpError } from '../../travelWindows/HttpError';
import { buildYnabPatch } from '../buildYnabPatch';
import {
    claimClassificationBatch,
    countClassificationSyncByStatus,
    markClassificationBatchFailed,
    markClassificationBatchSynced,
    revertClassificationBatchToPending,
} from '../data/classificationSyncRepo';
import type { OutboundSyncFlushDto } from '../ynabSyncDtos';
import { YnabRateLimitError } from './ynabRateLimit';
import type { YnabTransactionsWriter } from './ynabWriteClient';
import { createYnabTransactionsWriter } from './ynabWriteClient';

export type FlushOutboundSyncOptions = {
    readonly db?: AppDatabaseClient;
    readonly writer?: YnabTransactionsWriter;
    readonly now?: () => number;
    readonly batchSize?: number;
    readonly minIntervalMs?: number;
};

let lastFlushAt = 0;
let blockedUntil = 0;
let inFlight: Promise<OutboundSyncFlushDto> | undefined;
let flushTrigger: ((pendingCount: number) => void) | undefined;

/**
 * Registers the background flusher so enqueue can kick a count-threshold flush.
 */
export function setOutboundFlushTrigger(trigger: ((pendingCount: number) => void) | undefined): void {
    flushTrigger = trigger;
}

export function requestOutboundFlushIfDue(pendingCount: number): void {
    flushTrigger?.(pendingCount);
}

export function resetOutboundFlushClockForTests(): void {
    lastFlushAt = 0;
    blockedUntil = 0;
}

/**
 * Claims a pending batch and PATCHes YNAB once. Honors the min interval and 429 backoff.
 */
export async function flushOutboundSync(options: FlushOutboundSyncOptions = {}): Promise<OutboundSyncFlushDto> {
    if (inFlight !== undefined) {
        return await inFlight;
    }
    inFlight = runFlush(options).finally(() => {
        inFlight = undefined;
    });
    return await inFlight;
}

async function runFlush(options: FlushOutboundSyncOptions): Promise<OutboundSyncFlushDto> {
    const now = options.now ?? Date.now;
    const minIntervalMs = options.minIntervalMs ?? YNAB_FLUSH_MIN_INTERVAL_MS;
    const current = now();
    if (current < blockedUntil) {
        return skipped('rate_limit');
    }
    if (lastFlushAt > 0 && current - lastFlushAt < minIntervalMs) {
        return skipped('min_interval');
    }

    const database = options.db;
    const counts = await countClassificationSyncByStatus(database);
    if (counts.pending === 0) {
        return { attempted: 0, synced: 0, failed: 0, skipped: false };
    }

    const batchSize = options.batchSize ?? YNAB_FLUSH_BATCH_SIZE;
    const batchId = randomUUID();
    const claimed = await claimClassificationBatch(batchId, batchSize, database);
    if (claimed.length === 0) {
        return { attempted: 0, synced: 0, failed: 0, skipped: false };
    }

    const payload = claimed.map((row) => buildYnabPatch(row.transactionId, row.decision));
    const writer = options.writer ?? createYnabTransactionsWriter();
    lastFlushAt = now();
    try {
        await writer.updateTransactions(payload);
        await markClassificationBatchSynced(batchId, database);
        return { attempted: claimed.length, synced: claimed.length, failed: 0, skipped: false };
    } catch (error) {
        if (error instanceof YnabRateLimitError) {
            await revertClassificationBatchToPending(batchId, database);
            blockedUntil = now() + error.retryAfterMs;
            return skipped('rate_limit');
        }
        const message =
            error instanceof HttpError ? error.message : error instanceof Error ? error.message : String(error);
        await markClassificationBatchFailed(batchId, message, database);
        return { attempted: claimed.length, synced: 0, failed: claimed.length, skipped: false };
    }
}

function skipped(skipReason: string): OutboundSyncFlushDto {
    return { attempted: 0, synced: 0, failed: 0, skipped: true, skipReason };
}
