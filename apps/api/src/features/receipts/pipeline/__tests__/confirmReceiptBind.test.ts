import { describe, expect, it, vi } from 'vitest';

import { buildBindConfirmState, confirmReceiptBind } from '../confirmReceiptBind';

const receipt = {
    vendor: 'Costco Wholesale',
    purchaseDate: '2026-02-09',
    printedMilliunits: -84170,
    taxMilliunits: 5170,
    lines: [{ name: 'KS WATER', amountMilliunits: 79000, quantity: 1 }],
};

const transaction = {
    date: '2026-02-10',
    amountMilliunits: -84170,
    payeeName: 'Costco',
    importPayeeNameOriginal: 'COSTCO WHSE #0123 SEATTLE WA',
    accountName: 'Visa',
};

describe('buildBindConfirmState', () => {
    it('states raw facts from both sides and no computed verdict', () => {
        const state = buildBindConfirmState(receipt, transaction);

        expect(state).toContain('Costco Wholesale');
        expect(state).toContain('COSTCO WHSE #0123 SEATTLE WA');
        expect(state).toContain('$84.17 charge');
        expect(state).toContain('KS WATER: $79.00');
        expect(state).not.toMatch(/similar|confidence|score|match/i);
    });
});

describe('confirmReceiptBind', () => {
    it('returns the same-purchase probability and null for missing answers', async () => {
        const completeDecisionsImpl = vi.fn(async () => ({
            nouls: { same_purchase: 0.93 },
            usage: { promptTokens: 300, completionTokens: 0, totalTokens: 300, cachedTokens: null, costUsd: 0.00001 },
        }));

        const result = await confirmReceiptBind({
            apiKey: 'key',
            model: 'typesafe/jev-1.13',
            receipt,
            transaction,
            completeDecisionsImpl,
        });

        expect(result).toEqual({ samePurchase: 0.93, costUsd: 0.00001 });
        expect(completeDecisionsImpl).toHaveBeenCalledWith(
            expect.objectContaining({ questions: expect.objectContaining({ same_purchase: expect.anything() }) }),
        );
    });
});
