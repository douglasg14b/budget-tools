import { describe, expect, it } from 'vitest';

import { formatReceiptExtractDump, parseReceiptExtract } from '../parseReceiptExtract';

describe('parseReceiptExtract', () => {
    it('returns null for missing or invalid JSON', () => {
        expect(parseReceiptExtract(null)).toBeNull();
        expect(parseReceiptExtract('not-json')).toBeNull();
        expect(parseReceiptExtract('[]')).toBeNull();
    });

    it('fills defaults when keys are missing so a failed extract can still be shown', () => {
        expect(parseReceiptExtract('{}')).toEqual({
            repaired: false,
            gated: false,
            headerPrintedMilliunits: null,
            ocrPrintedMilliunits: null,
            taxMilliunits: 0,
            discountMilliunits: 0,
            lines: [],
            error: null,
        });
    });

    it('reads lines, tax, discount, and error', () => {
        const parsed = parseReceiptExtract(
            JSON.stringify({
                repaired: true,
                gated: true,
                headerPrintedMilliunits: 8120,
                ocrPrintedMilliunits: 8120,
                taxMilliunits: 620,
                discountMilliunits: 200,
                error: 'vision down',
                lines: [
                    { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Skip me' },
                    { amountMilliunits: 1 },
                ],
            }),
        );
        expect(parsed).toMatchObject({
            repaired: true,
            gated: true,
            taxMilliunits: 620,
            discountMilliunits: 200,
            error: 'vision down',
            lines: [
                { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
                { name: 'Skip me', amountMilliunits: null, quantity: null },
            ],
        });
    });
});

describe('formatReceiptExtractDump', () => {
    it('joins named amounts with tax and discount rows', () => {
        expect(
            formatReceiptExtractDump(
                [
                    { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Note', amountMilliunits: null, quantity: null },
                ],
                620,
                200,
            ),
        ).toBe('Latte 4.50\nNote\nTax 0.62\nDiscount 0.20');
    });
});
