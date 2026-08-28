import { describe, expect, it } from 'vitest';

import { ynabRetryAfterMs } from '../ynabRateLimit';

describe('ynabRetryAfterMs', () => {
    it('detects a 429 id and defaults to one minute', () => {
        expect(ynabRetryAfterMs({ error: { id: '429' } })).toBe(60_000);
    });

    it('uses Retry-After seconds when present', () => {
        expect(ynabRetryAfterMs({ status: 429, response: { headers: { 'retry-after': '12' } } })).toBe(12_000);
    });

    it('ignores non-rate-limit errors', () => {
        expect(ynabRetryAfterMs({ error: { id: '400', detail: 'bad' } })).toBeUndefined();
    });
});
