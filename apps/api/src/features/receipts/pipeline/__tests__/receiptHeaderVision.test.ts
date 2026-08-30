import { describe, expect, it } from 'vitest';

import { parseHeaderCompletion, parseRepairCompletion } from '../receiptHeaderVision';

describe('parseHeaderCompletion', () => {
    it('reads vendor, ISO date, and printed dollars as milliunits', () => {
        expect(
            parseHeaderCompletion(
                JSON.stringify({
                    vendor: 'Cafe Rio',
                    purchaseDate: '2026-08-01',
                    printedTotalDollars: 12.34,
                }),
            ),
        ).toEqual({
            vendor: 'Cafe Rio',
            purchaseDate: '2026-08-01',
            printedMilliunits: 12340,
        });
    });

    it('drops a non-ISO purchase date instead of inventing one', () => {
        expect(
            parseHeaderCompletion(
                JSON.stringify({
                    vendor: 'Cafe',
                    purchaseDate: '08/01/2026',
                    printedTotalDollars: null,
                }),
            ),
        ).toEqual({
            vendor: 'Cafe',
            purchaseDate: null,
            printedMilliunits: null,
        });
    });

    it('keeps an ISO calendar date prefix when a time is attached', () => {
        expect(
            parseHeaderCompletion(
                JSON.stringify({
                    vendor: 'Cafe',
                    purchaseDate: '2026-08-01T00:00:00Z',
                    printedTotalDollars: 1,
                }),
            ).purchaseDate,
        ).toBe('2026-08-01');
    });
});

describe('parseRepairCompletion', () => {
    it('maps lines, tax, and discount to milliunits', () => {
        expect(
            parseRepairCompletion(
                JSON.stringify({
                    vendor: 'Cafe Rio',
                    purchaseDate: '2026-08-01',
                    printedTotalDollars: 8.12,
                    taxDollars: 0.62,
                    discountDollars: -0.2,
                    lines: [{ name: 'Latte', amountDollars: 4.5, quantity: 1 }],
                }),
            ),
        ).toEqual({
            vendor: 'Cafe Rio',
            purchaseDate: '2026-08-01',
            printedMilliunits: 8120,
            taxMilliunits: 620,
            discountMilliunits: 200,
            lines: [{ name: 'Latte', amountMilliunits: 4500, quantity: 1 }],
        });
    });
});
