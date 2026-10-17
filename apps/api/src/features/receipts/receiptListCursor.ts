import { HttpError } from '../travelWindows/HttpError';
import type { ReceiptListCursor } from './data/receiptsRepo';

/** Opaque to clients: base64url of `createdAt` and `id`, newline-separated. */
export function encodeReceiptCursor(cursor: ReceiptListCursor): string {
    return Buffer.from(`${cursor.createdAt}\n${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeReceiptCursor(cursor: string): ReceiptListCursor {
    const [createdAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('\n');
    if (!createdAt || !id || rest.length > 0) {
        throw new HttpError(400, 'Receipt list cursor is invalid');
    }
    return { createdAt, id };
}
