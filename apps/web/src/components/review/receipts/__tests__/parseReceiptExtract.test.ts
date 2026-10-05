import { describe, expect, it } from 'vitest';

import { parseReceiptExtract } from '../parseReceiptExtract';

describe('parseReceiptExtract', () => {
    it('returns null for missing or invalid JSON', () => {
        expect(parseReceiptExtract(null)).toBeNull();
        expect(parseReceiptExtract('not-json')).toBeNull();
        expect(parseReceiptExtract('[]')).toBeNull();
    });

    it('fills defaults when keys are missing', () => {
        expect(parseReceiptExtract('{}')).toEqual({
            repaired: false,
            gated: false,
            headerPrintedMilliunits: null,
            ocrPrintedMilliunits: null,
            taxMilliunits: 0,
            discountMilliunits: 0,
            tipMilliunits: 0,
            lines: [],
            error: null,
            totalReconciled: false,
        });
        expect(parseReceiptExtract('{"tipMilliunits":5000}')?.tipMilliunits).toBe(5000);
    });

    it('flags a total settled from subtotal plus tip', () => {
        expect(
            parseReceiptExtract(JSON.stringify({ handwrittenTotals: { totalSource: 'reconciled' } }))?.totalReconciled,
        ).toBe(true);
        expect(
            parseReceiptExtract(JSON.stringify({ handwrittenTotals: { totalSource: 'read' } }))?.totalReconciled,
        ).toBe(false);
    });

    it('reads named lines and skips rows without a name', () => {
        expect(
            parseReceiptExtract(
                JSON.stringify({
                    taxMilliunits: 100,
                    lines: [{ name: 'Milk', amountMilliunits: 3990, quantity: 2 }, { amountMilliunits: 1 }],
                }),
            )?.lines,
        ).toEqual([{ name: 'Milk', amountMilliunits: 3990, quantity: 2 }]);
    });
});
