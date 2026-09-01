import { describe, expect, it } from 'vitest';

import { seedReceiptSplitDraft } from '../seedReceiptSplitDraft';

describe('seedReceiptSplitDraft', () => {
    it('uses gated line amounts only when they sum to the bank charge', () => {
        const draft = seedReceiptSplitDraft({
            extractStatus: 'gated',
            totalsDisagree: false,
            bankMilliunits: -8120,
            extractJson: JSON.stringify({
                taxMilliunits: 620,
                discountMilliunits: 200,
                lines: [
                    { name: 'Coffee', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
                ],
            }),
        });
        expect(draft).toEqual({
            kind: 'split',
            lines: [
                { amountMilliunits: -4500, memo: 'Coffee' },
                { amountMilliunits: -3200, memo: 'Muffin' },
                { amountMilliunits: -620, memo: 'Tax' },
                { amountMilliunits: 200, memo: 'Discount' },
            ],
        });
    });

    it('falls back to equal bank shares when gated amounts do not match the bank', () => {
        const draft = seedReceiptSplitDraft({
            extractStatus: 'gated',
            totalsDisagree: false,
            bankMilliunits: -9000,
            extractJson: JSON.stringify({
                taxMilliunits: 0,
                discountMilliunits: 0,
                lines: [
                    { name: 'Coffee', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
                ],
            }),
        });
        expect(draft?.kind).toBe('split');
        expect(draft?.lines.map((line) => line.amountMilliunits).reduce((sum, amount) => sum + amount, 0)).toBe(-9000);
        expect(draft?.lines.map((line) => line.memo)).toEqual(['Coffee', 'Muffin']);
    });

    it('does not invent a split for one ungated name', () => {
        expect(
            seedReceiptSplitDraft({
                extractStatus: 'ungated',
                totalsDisagree: false,
                bankMilliunits: -3990,
                extractJson: JSON.stringify({
                    taxMilliunits: 0,
                    discountMilliunits: 0,
                    lines: [{ name: 'Milk', amountMilliunits: 4100, quantity: 1 }],
                }),
            }),
        ).toEqual({
            kind: 'single',
            lines: [{ amountMilliunits: -3990, memo: 'Milk' }],
        });
    });

    it('does not seed pending, failed, or totals-disagree extracts', () => {
        const json = JSON.stringify({
            taxMilliunits: 0,
            discountMilliunits: 0,
            lines: [{ name: 'Milk', amountMilliunits: 3990, quantity: 1 }],
        });
        expect(
            seedReceiptSplitDraft({
                extractStatus: 'pending',
                totalsDisagree: false,
                bankMilliunits: -3990,
                extractJson: json,
            }),
        ).toBeNull();
        expect(
            seedReceiptSplitDraft({
                extractStatus: 'gated',
                totalsDisagree: true,
                bankMilliunits: -3990,
                extractJson: json,
            }),
        ).toBeNull();
    });
});
