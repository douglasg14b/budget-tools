import { describe, expect, it } from 'vitest';

import { RECEIPTS_JSON_BODY_LIMIT } from '../environment';
import { isPayloadTooLargeError, receiptsJsonBodyTooLargeMessage } from '../payloadTooLarge';

describe('payloadTooLarge', () => {
    it('detects express entity.too.large errors', () => {
        const error = Object.assign(new Error('request entity too large'), {
            status: 413,
            statusCode: 413,
            type: 'entity.too.large',
        });
        expect(isPayloadTooLargeError(error)).toBe(true);
        expect(isPayloadTooLargeError(new Error('other'))).toBe(false);
    });

    it('names the configured receipts JSON limit', () => {
        expect(receiptsJsonBodyTooLargeMessage()).toContain(String(RECEIPTS_JSON_BODY_LIMIT));
        expect(receiptsJsonBodyTooLargeMessage()).toContain('RECEIPTS_JSON_BODY_LIMIT');
    });
});
