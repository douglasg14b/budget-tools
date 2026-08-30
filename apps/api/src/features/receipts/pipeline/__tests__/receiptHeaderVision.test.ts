import { describe, expect, it } from 'vitest';

import { parseHeaderCompletion, parseLinesCompletion } from '../receiptHeaderVision';

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

describe('parseLinesCompletion', () => {
    it('maps lines, tax, and discount to milliunits', () => {
        expect(
            parseLinesCompletion(
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

    it('unwraps a single-object JSON array from the line model', () => {
        expect(
            parseLinesCompletion(
                JSON.stringify([
                    {
                        vendor: 'SAVE MART SUPERMARKETS',
                        purchaseDate: '2010-10-23',
                        printedTotalDollars: 3.99,
                        taxDollars: 0,
                        discountDollars: 0,
                        lines: [{ name: 'APPLES FUJI BAG OR', amountDollars: 3.99, quantity: 1 }],
                    },
                ]),
            ),
        ).toEqual({
            vendor: 'SAVE MART SUPERMARKETS',
            purchaseDate: '2010-10-23',
            printedMilliunits: 3990,
            taxMilliunits: 0,
            discountMilliunits: 0,
            lines: [{ name: 'APPLES FUJI BAG OR', amountMilliunits: 3990, quantity: 1 }],
        });
    });
});
