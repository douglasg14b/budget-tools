import { describe, expect, it } from 'vitest';

import { attachItemCategories } from '../attachItemCategories';

describe('attachItemCategories', () => {
    it('maps each item by itemIndex even when the memo is shortened', () => {
        const items = attachItemCategories(
            [
                {
                    orderId: 'o-1',
                    title: 'Ukontagood 16 Pack Assorted Inflatable Beach Balls',
                    asin: 'B1',
                    quantity: 1,
                    itemTotalMilliunits: -4000,
                },
                { orderId: 'o-1', title: 'Bandages', asin: 'B2', quantity: 2, itemTotalMilliunits: -6000 },
            ],
            [
                {
                    amount: -4000,
                    categoryId: 'cat-h',
                    categoryName: '🛒 Household Supplies',
                    categoryGroup: 'Living Expenses',
                    memo: '16-pack small beach balls',
                    itemIndex: 0,
                },
                {
                    amount: -6000,
                    categoryId: 'cat-m',
                    categoryName: '🩹 Medical - Supplies',
                    categoryGroup: 'Medical',
                    memo: 'bandages',
                    itemIndex: 1,
                },
            ],
        );
        expect(items.map((item) => item.categoryId)).toEqual(['cat-h', 'cat-m']);
        expect(items[0]?.categoryGroup).toBe('Living Expenses');
        expect(items[1]?.quantity).toBe(2);
    });

    it('falls back to memo title match when itemIndex is missing', () => {
        const items = attachItemCategories(
            [
                { orderId: 'o-1', title: 'Paper towels', asin: 'B1', quantity: 1, itemTotalMilliunits: -4000 },
                { orderId: 'o-1', title: 'Bandages', asin: 'B2', quantity: 2, itemTotalMilliunits: -6000 },
            ],
            [
                {
                    amount: -4000,
                    categoryId: 'cat-h',
                    categoryName: '🛒 Household Supplies',
                    categoryGroup: 'Living Expenses',
                    memo: 'Paper towels',
                    itemIndex: null,
                },
                {
                    amount: -6000,
                    categoryId: 'cat-m',
                    categoryName: '🩹 Medical - Supplies',
                    categoryGroup: 'Medical',
                    memo: 'Bandages',
                    itemIndex: null,
                },
            ],
        );
        expect(items.map((item) => item.categoryId)).toEqual(['cat-h', 'cat-m']);
    });

    it('leaves unmatched items uncategorized', () => {
        const items = attachItemCategories(
            [{ orderId: 'o-1', title: 'Unknown sku', asin: null, quantity: 1, itemTotalMilliunits: -1000 }],
            [
                {
                    amount: -1000,
                    categoryId: 'cat-h',
                    categoryName: 'Household',
                    categoryGroup: 'Needs',
                    memo: 'Paper towels',
                    itemIndex: null,
                },
            ],
        );
        expect(items[0]?.categoryId).toBeNull();
        expect(items[0]?.categoryName).toBeNull();
    });
});
