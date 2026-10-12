import { describe, expect, it } from 'vitest';

import { seedReceiptSplitDraft } from '../seedReceiptSplitDraft';

const TRANSIENT = { id: 'cat-transient', name: '🔄 Transient / Reimbursable', groupName: 'Flex' };

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
            reimbursableCategory: null,
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

    it('adds a tip row so a tipped gated receipt still sums to the bank charge', () => {
        const draft = seedReceiptSplitDraft({
            extractStatus: 'gated',
            totalsDisagree: false,
            bankMilliunits: -17_660,
            extractJson: JSON.stringify({
                taxMilliunits: 0,
                discountMilliunits: 0,
                tipMilliunits: 5000,
                lines: [{ name: 'Subtotal', amountMilliunits: 12_660, quantity: null }],
            }),
            reimbursableCategory: null,
        });
        expect(draft).toEqual({
            kind: 'split',
            lines: [
                { amountMilliunits: -12_660, memo: 'Subtotal' },
                { amountMilliunits: -5000, memo: 'Tip' },
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
            reimbursableCategory: null,
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
                reimbursableCategory: null,
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
                reimbursableCategory: null,
            }),
        ).toBeNull();
        expect(
            seedReceiptSplitDraft({
                extractStatus: 'gated',
                totalsDisagree: true,
                bankMilliunits: -3990,
                extractJson: json,
                reimbursableCategory: null,
            }),
        ).toBeNull();
    });

    describe('written reimbursable share', () => {
        const kroger = (reimbursable: unknown) =>
            JSON.stringify({
                taxMilliunits: 7410,
                discountMilliunits: 7050,
                lines: [
                    { name: 'COFFEE PC', amountMilliunits: 6990, quantity: 1 },
                    { name: 'VANILLA', amountMilliunits: 6990, quantity: 1 },
                ],
                reimbursable,
            });

        it('splits the share into the reimbursable category and leaves the rest to pick', () => {
            const draft = seedReceiptSplitDraft({
                extractStatus: 'ungated',
                totalsDisagree: false,
                bankMilliunits: -109_230,
                extractJson: kroger({ writtenText: 'Roimbursoable: $54.61', amountMilliunits: 54_610 }),
                reimbursableCategory: TRANSIENT,
            });
            expect(draft).toEqual({
                kind: 'split',
                lines: [
                    { amountMilliunits: -54_610, memo: null, category: TRANSIENT },
                    { amountMilliunits: -54_620, memo: null },
                ],
            });
        });

        it('seeds the whole charge as reimbursable when the share equals it', () => {
            expect(
                seedReceiptSplitDraft({
                    extractStatus: 'gated',
                    totalsDisagree: false,
                    bankMilliunits: -7840,
                    extractJson: kroger({ writtenText: 'Reimbursable 7.84', amountMilliunits: 7840 }),
                    reimbursableCategory: TRANSIENT,
                }),
            ).toEqual({ kind: 'single', lines: [{ amountMilliunits: -7840, memo: null, category: TRANSIENT }] });
        });

        it('ignores the extract gate: the share is checked against the bank charge itself', () => {
            expect(
                seedReceiptSplitDraft({
                    extractStatus: 'ungated',
                    totalsDisagree: true,
                    bankMilliunits: -20_000,
                    extractJson: kroger({ writtenText: null, amountMilliunits: 5000 }),
                    reimbursableCategory: TRANSIENT,
                })?.lines[0],
            ).toEqual({ amountMilliunits: -5000, memo: null, category: TRANSIENT });
        });

        it('falls back to the line draft when the share is missing, too large, or has no category', () => {
            const lineDraft = (reimbursable: unknown, category: typeof TRANSIENT | null) =>
                seedReceiptSplitDraft({
                    extractStatus: 'ungated',
                    totalsDisagree: false,
                    bankMilliunits: -20_000,
                    extractJson: kroger(reimbursable),
                    reimbursableCategory: category,
                })?.lines.map((line) => line.memo);
            expect(lineDraft({ writtenText: 'Reimb', amountMilliunits: null }, TRANSIENT)).toEqual([
                'COFFEE PC',
                'VANILLA',
            ]);
            expect(lineDraft({ writtenText: 'Reimb $250', amountMilliunits: 250_000 }, TRANSIENT)).toEqual([
                'COFFEE PC',
                'VANILLA',
            ]);
            expect(lineDraft({ writtenText: 'Reimb $5', amountMilliunits: 5000 }, null)).toEqual([
                'COFFEE PC',
                'VANILLA',
            ]);
        });
    });
});
