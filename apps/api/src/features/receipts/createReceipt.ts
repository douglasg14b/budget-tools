import type { AppDatabaseClient } from '../../data-persistence/database';
import { HttpError } from '../travelWindows/HttpError';
import { assertReceiptWritesAllowed } from './assertReceiptWritesAllowed';
import type { ReceiptRow } from './data/receiptsRepo';
import { insertReceiptOriginal } from './data/receiptsRepo';
import { assertReceiptFrameCountWithinLimit } from './receiptLimits';

export type CreateReceiptInput = {
    readonly frames: readonly string[];
    readonly processed?: string;
    readonly transactionId?: string | null;
    readonly receiptsDir?: string;
};

export function decodeDataUrlFrame(value: string): Buffer {
    const trimmed = value.trim();
    const match = /^data:([^,]*),(.*)$/s.exec(trimmed);
    if (!match) {
        throw new HttpError(400, 'Receipt frame must be a data URL');
    }
    const header = match[1] ?? '';
    if (!header.includes('base64')) {
        throw new HttpError(400, 'Receipt frame data URL must be base64');
    }
    const payload = match[2] ?? '';
    const compact = payload.replace(/\s/g, '');
    if (!compact || /[^A-Za-z0-9+/=]/.test(compact)) {
        throw new HttpError(400, 'Receipt frame data URL is not valid base64');
    }
    const bytes = Buffer.from(compact, 'base64');
    if (!bytes.length) {
        throw new HttpError(400, 'Receipt frame is empty');
    }
    return bytes;
}

export async function createReceipt(input: CreateReceiptInput, db?: AppDatabaseClient): Promise<ReceiptRow> {
    await assertReceiptWritesAllowed(db);
    if (input.frames.length === 0) {
        throw new HttpError(400, 'Receipt create requires at least one frame');
    }
    assertReceiptFrameCountWithinLimit(input.frames.length);
    const buffers = input.frames.map(decodeDataUrlFrame);
    const [bytes, ...extraFrames] = buffers;
    if (!bytes) {
        throw new HttpError(400, 'Receipt create requires at least one frame');
    }
    return insertReceiptOriginal(
        {
            bytes,
            extraFrames,
            processed: input.processed ? decodeDataUrlFrame(input.processed) : undefined,
            transactionId: input.transactionId,
            receiptsDir: input.receiptsDir,
        },
        db,
    );
}
