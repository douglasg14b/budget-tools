import { RECEIPTS_JSON_BODY_LIMIT } from './environment';

export function isPayloadTooLargeError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined;
    const type = 'type' in error && typeof error.type === 'string' ? error.type : undefined;
    return status === 413 || statusCode === 413 || type === 'entity.too.large';
}

export function receiptsJsonBodyTooLargeMessage(): string {
    return `Receipt JSON body exceeds RECEIPTS_JSON_BODY_LIMIT (${RECEIPTS_JSON_BODY_LIMIT} bytes)`;
}
