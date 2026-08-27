import { describe, expect, it } from 'vitest';

import { oldestAmazonBankDate } from '../oldestUncategorizedAmazonDate';

describe('oldestAmazonBankDate', () => {
    it('returns the earliest uncategorized Amazon bank date', () => {
        expect(
            oldestAmazonBankDate([
                {
                    date: '2026-06-20',
                    payeeName: 'Amazon',
                    importPayeeName: null,
                    importPayeeNameOriginal: null,
                },
                {
                    date: '2026-01-15',
                    payeeName: 'AMZN MKTP',
                    importPayeeName: null,
                    importPayeeNameOriginal: null,
                },
                {
                    date: '2025-12-01',
                    payeeName: 'Safeway',
                    importPayeeName: 'SAFEWAY',
                    importPayeeNameOriginal: null,
                },
            ]),
        ).toBe('2026-01-15');
    });

    it('returns null when the queue has no Amazon charges', () => {
        expect(
            oldestAmazonBankDate([
                {
                    date: '2026-01-15',
                    payeeName: 'Safeway',
                    importPayeeName: null,
                    importPayeeNameOriginal: null,
                },
            ]),
        ).toBeNull();
    });
});
