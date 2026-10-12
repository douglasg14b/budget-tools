import { describe, expect, it } from 'vitest';

import { applyReceiptExtractEdit } from '../applyReceiptExtractEdit';

const cafeEdit = {
    vendor: 'Cafe Rio',
    purchaseDate: '2026-08-01',
    printedMilliunits: 8120,
    taxMilliunits: 620,
    discountMilliunits: 200,
    lines: [
        { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
        { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
    ],
};

describe('applyReceiptExtractEdit', () => {
    it('marks gated when lines plus tax minus discounts equal the printed total', () => {
        const result = applyReceiptExtractEdit({ previousExtractJson: null, edit: cafeEdit });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(result.totalsDisagree).toBe(false);
        expect(JSON.parse(result.extractJson)).toMatchObject({ gated: true, error: null });
        expect(result.rawText).toContain('Latte 4.50');
    });

    it('marks ungated when the arithmetic does not match', () => {
        const result = applyReceiptExtractEdit({
            previousExtractJson: null,
            edit: { ...cafeEdit, printedMilliunits: 9000 },
        });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(result.extractStatus).toBe('ungated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ gated: false });
    });

    it('keeps the previously extracted tip when the edit omits it', () => {
        const result = applyReceiptExtractEdit({
            previousExtractJson: JSON.stringify({ tipMilliunits: 1500 }),
            edit: { ...cafeEdit, printedMilliunits: 9620 },
        });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ gated: true, tipMilliunits: 1500 });
        expect(result.rawText).toContain('Tip 1.50');
    });

    it('lets the reviewer clear a tip explicitly', () => {
        const result = applyReceiptExtractEdit({
            previousExtractJson: JSON.stringify({ tipMilliunits: 1500 }),
            edit: { ...cafeEdit, tipMilliunits: 0 },
        });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ tipMilliunits: 0 });
    });

    it('keeps, re-amounts, or clears the reimbursable mark', () => {
        const previousExtractJson = JSON.stringify({
            reimbursable: { writtenText: 'Reimbursable: $4.00', amountMilliunits: 4000 },
        });
        const reimbursableAfter = (reimbursable?: { amountMilliunits: number | null } | null) => {
            const result = applyReceiptExtractEdit({ previousExtractJson, edit: { ...cafeEdit, reimbursable } });
            return result.kind === 'applied' ? JSON.parse(result.extractJson).reimbursable : 'not applied';
        };
        expect(reimbursableAfter()).toEqual({ writtenText: 'Reimbursable: $4.00', amountMilliunits: 4000 });
        expect(reimbursableAfter({ amountMilliunits: 4100 })).toEqual({
            writtenText: 'Reimbursable: $4.00',
            amountMilliunits: 4100,
        });
        expect(reimbursableAfter({ amountMilliunits: null })).toEqual({
            writtenText: 'Reimbursable: $4.00',
            amountMilliunits: null,
        });
        expect(reimbursableAfter(null)).toBeUndefined();
    });

    it('marks failed when a match key is missing', () => {
        const result = applyReceiptExtractEdit({
            previousExtractJson: null,
            edit: { ...cafeEdit, vendor: '  ' },
        });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(result.extractStatus).toBe('failed');
        expect(result.vendor).toBeNull();
    });

    it('refuses an Amazon vendor without rewriting extract', () => {
        expect(
            applyReceiptExtractEdit({
                previousExtractJson: '{"error":"keep me"}',
                edit: { ...cafeEdit, vendor: 'Amazon.com' },
            }),
        ).toEqual({ kind: 'amazon' });
    });

    it('preserves prior repaired and header totals and clears extract error', () => {
        const result = applyReceiptExtractEdit({
            previousExtractJson: JSON.stringify({
                repaired: true,
                headerPrintedMilliunits: 1000,
                ocrPrintedMilliunits: 1100,
                error: 'old',
            }),
            edit: cafeEdit,
        });
        expect(result.kind).toBe('applied');
        if (result.kind !== 'applied') {
            return;
        }
        expect(JSON.parse(result.extractJson)).toMatchObject({
            repaired: true,
            headerPrintedMilliunits: 1000,
            ocrPrintedMilliunits: 1100,
            error: null,
        });
    });
});
