import { describe, expect, it } from 'vitest';

import { amazonOrderLooksIncomplete } from '../amazonOrderLooksIncomplete';

describe('amazonOrderLooksIncomplete', () => {
    it('flags a $19.99 single item when the order total is missing', () => {
        expect(
            amazonOrderLooksIncomplete({
                orderId: '113-4054860-2834645',
                orderDate: '2026-08-01',
                totalMilliunits: 0,
                shippingMilliunits: null,
                taxMilliunits: null,
                promotionMilliunits: null,
                items: [
                    {
                        asin: 'B0GHQTLXVM',
                        title: 'Beach balls',
                        quantity: 1,
                        itemTotalMilliunits: 19990,
                    },
                ],
            }),
        ).toBe(true);
    });

    it('flags when line items do not cover the grand total', () => {
        expect(
            amazonOrderLooksIncomplete({
                orderId: 'o-1',
                orderDate: null,
                totalMilliunits: 73920,
                shippingMilliunits: 0,
                taxMilliunits: 0,
                promotionMilliunits: 0,
                items: [{ asin: null, title: 'One of four', quantity: 1, itemTotalMilliunits: 19990 }],
            }),
        ).toBe(true);
    });

    it('keeps a complete order whose items cover the total', () => {
        expect(
            amazonOrderLooksIncomplete({
                orderId: 'o-1',
                orderDate: null,
                totalMilliunits: 73920,
                shippingMilliunits: 0,
                taxMilliunits: 3920,
                promotionMilliunits: 0,
                items: [
                    { asin: null, title: 'A', quantity: 1, itemTotalMilliunits: 19990 },
                    { asin: null, title: 'B', quantity: 1, itemTotalMilliunits: 20000 },
                    { asin: null, title: 'C', quantity: 1, itemTotalMilliunits: 15000 },
                    { asin: null, title: 'D', quantity: 1, itemTotalMilliunits: 15010 },
                ],
            }),
        ).toBe(false);
    });
});
