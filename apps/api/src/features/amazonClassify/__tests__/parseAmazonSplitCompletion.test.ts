import { describe, expect, it } from 'vitest';

import { collapseAndBalance, parseAmazonSplitCompletion } from '../parseAmazonSplitCompletion';

const catalog = [
    { id: 'cat-g', name: 'Groceries', groupName: 'Needs' },
    { id: 'cat-h', name: 'Household', groupName: 'Needs' },
    { id: 'cat-supplies', name: '🛒 Household Supplies', groupName: 'Living Expenses' },
    { id: 'cat-med', name: '🩹 Medical - Supplies', groupName: 'Medical' },
    { id: 'cat-outing', name: 'Outing / Theater', groupName: 'Fun' },
];

describe('parseAmazonSplitCompletion', () => {
    it('maps pick-list names and balances milliunits', () => {
        const parsed = parseAmazonSplitCompletion(
            JSON.stringify({
                lines: [
                    {
                        categoryName: 'Groceries',
                        categoryGroupName: 'Needs',
                        amountMilliunits: -4001,
                        memo: 'Milk',
                    },
                    {
                        categoryName: 'Household',
                        categoryGroupName: 'Needs',
                        amountMilliunits: -5999,
                        memo: 'Soap',
                    },
                ],
                rationale: 'mixed cart',
            }),
            catalog,
            -10000,
        );
        expect(parsed.lines.map((line) => line.categoryId)).toEqual(['cat-g', 'cat-h']);
        expect(parsed.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(-10000);
        expect(parsed.rationale).toBe('mixed cart');
        expect(parsed.rawLines).toHaveLength(2);
    });

    it('resolves Group / emoji Category pick-list copies', () => {
        const parsed = parseAmazonSplitCompletion(
            JSON.stringify({
                lines: [
                    {
                        categoryName: 'Living Expenses / 🛒 Household Supplies',
                        categoryGroupName: 'Living Expenses',
                        amountMilliunits: -4000,
                        memo: 'Paper towels',
                    },
                    {
                        categoryName: 'Medical / 🩹 Medical - Supplies',
                        categoryGroupName: 'Medical',
                        amountMilliunits: -6000,
                        memo: 'Bandages',
                    },
                ],
                rationale: 'copied pick-list labels',
            }),
            catalog,
            -10000,
        );
        expect(parsed.rawLines.map((line) => line.categoryId)).toEqual(['cat-supplies', 'cat-med']);
    });

    it('does not treat Outing / Theater as a group prefix', () => {
        const parsed = parseAmazonSplitCompletion(
            JSON.stringify({
                lines: [
                    {
                        categoryName: 'Outing / Theater',
                        categoryGroupName: 'Fun',
                        amountMilliunits: -10000,
                        memo: 'Tickets',
                    },
                ],
                rationale: 'show',
            }),
            catalog,
            -10000,
        );
        expect(parsed.lines[0]?.categoryId).toBe('cat-outing');
    });

    it('flips Amazon-positive item amounts onto the bank charge sign', () => {
        const parsed = parseAmazonSplitCompletion(
            JSON.stringify({
                lines: [
                    {
                        categoryName: 'Groceries',
                        categoryGroupName: 'Needs',
                        amountMilliunits: 19990,
                        memo: 'Beach balls',
                    },
                ],
                rationale: 'copied Amazon price sign',
            }),
            catalog,
            -19990,
        );
        expect(parsed.rawLines[0]?.amount).toBe(-19990);
    });

    it('shortens memos and keeps itemIndex for Amazon items', () => {
        const parsed = parseAmazonSplitCompletion(
            JSON.stringify({
                lines: [
                    {
                        categoryName: 'Groceries',
                        categoryGroupName: 'Needs',
                        amountMilliunits: -19990,
                        memo: '16-pack assorted beach balls, 8-inch, 14-inch, 16-inch, and 24-inch',
                        itemIndex: 0,
                    },
                ],
                rationale: 'one item',
            }),
            catalog,
            -19990,
            1,
        );
        expect(parsed.rawLines[0]?.memo).toBe('16-pack assorted beach balls');
        expect(parsed.rawLines[0]?.itemIndex).toBe(0);
        expect(parsed.lines[0]?.memo).toBe('16-pack assorted beach balls');
    });

    it('collapses same-category lines to one', () => {
        const collapsed = collapseAndBalance(
            [
                {
                    amount: -4000,
                    categoryId: 'cat-g',
                    categoryName: 'Groceries',
                    categoryGroup: 'Needs',
                    memo: 'Milk',
                },
                {
                    amount: -6000,
                    categoryId: 'cat-g',
                    categoryName: 'Groceries',
                    categoryGroup: 'Needs',
                    memo: 'Eggs',
                },
            ],
            -10000,
        );
        expect(collapsed).toEqual([
            {
                amount: -10000,
                categoryId: 'cat-g',
                categoryName: 'Groceries',
                categoryGroup: 'Needs',
                memo: null,
            },
        ]);
    });
});
