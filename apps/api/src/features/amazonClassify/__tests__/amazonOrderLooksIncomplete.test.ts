import { describe, expect, it } from 'vitest';

import {
    amazonItemsLookIncomplete,
    amazonOrderLooksIncomplete,
    amazonOrderNeedsRefetch,
} from '../amazonOrderLooksIncomplete';

describe('amazonOrderLooksIncomplete', () => {
    it('does not flag a scraped item list when the invoice total is missing', () => {
        expect(
            amazonOrderLooksIncomplete({
                orderId: '113-7991450-8305811',
                orderDate: null,
                totalMilliunits: 0,
                shippingMilliunits: null,
                taxMilliunits: null,
                promotionMilliunits: null,
                subtotalMilliunits: null,
                items: [
                    {
                        asin: 'B0H8JBNCSQ',
                        title: 'Cervical pillow',
                        quantity: 1,
                        itemTotalMilliunits: 35990,
                    },
                ],
            }),
        ).toBe(false);
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
                subtotalMilliunits: null,
                items: [{ asin: null, title: 'One of four', quantity: 1, itemTotalMilliunits: 19990 }],
            }),
        ).toBe(true);
    });

    it('flags when the item list is empty, even if no order rows were stored', () => {
        expect(amazonItemsLookIncomplete([], [], ['113-4054860-2834645'])).toBe(true);
    });

    it('flags when a payment lists an order that was not stored', () => {
        expect(
            amazonItemsLookIncomplete(
                [{ asin: null, title: 'A', quantity: 1, itemTotalMilliunits: 19990 }],
                [],
                ['113-4054860-2834645'],
            ),
        ).toBe(true);
    });

    it('does not flag Subscribe & Save list price as missing line items when invoice total is 0', () => {
        expect(
            amazonItemsLookIncomplete(
                [{ asin: 'B091J6NVS5', title: 'SAFESKIN gloves', quantity: 1, itemTotalMilliunits: 46990 }],
                [
                    {
                        orderId: '112-6525276-5321000',
                        orderDate: null,
                        totalMilliunits: 0,
                        shippingMilliunits: null,
                        taxMilliunits: null,
                        promotionMilliunits: null,
                        subtotalMilliunits: null,
                        items: [
                            { asin: 'B091J6NVS5', title: 'SAFESKIN gloves', quantity: 1, itemTotalMilliunits: 46990 },
                        ],
                    },
                ],
                ['112-6525276-5321000'],
                -39940,
            ),
        ).toBe(false);
    });

    it('flags a $19.99 line against a $73.92 bank charge as missing line items', () => {
        expect(
            amazonItemsLookIncomplete(
                [{ asin: 'B0GHQTLXVM', title: 'Beach balls', quantity: 1, itemTotalMilliunits: 19990 }],
                [
                    {
                        orderId: '113-4054860-2834645',
                        orderDate: null,
                        totalMilliunits: 0,
                        shippingMilliunits: null,
                        taxMilliunits: null,
                        promotionMilliunits: null,
                        subtotalMilliunits: null,
                        items: [{ asin: 'B0GHQTLXVM', title: 'Beach balls', quantity: 1, itemTotalMilliunits: 19990 }],
                    },
                ],
                ['113-4054860-2834645'],
                -73920,
            ),
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
                subtotalMilliunits: null,
                items: [
                    { asin: null, title: 'A', quantity: 1, itemTotalMilliunits: 19990 },
                    { asin: null, title: 'B', quantity: 1, itemTotalMilliunits: 20000 },
                    { asin: null, title: 'C', quantity: 1, itemTotalMilliunits: 15000 },
                    { asin: null, title: 'D', quantity: 1, itemTotalMilliunits: 15010 },
                ],
            }),
        ).toBe(false);
    });

    it('re-fetches orders whose invoice total never landed', () => {
        expect(
            amazonOrderNeedsRefetch({
                orderId: '112-6525276-5321000',
                orderDate: null,
                totalMilliunits: 0,
                shippingMilliunits: null,
                taxMilliunits: null,
                promotionMilliunits: null,
                subtotalMilliunits: null,
                items: [{ asin: 'B091J6NVS5', title: 'SAFESKIN gloves', quantity: 1, itemTotalMilliunits: 46990 }],
            }),
        ).toBe(true);
        expect(
            amazonOrderLooksIncomplete({
                orderId: '112-6525276-5321000',
                orderDate: null,
                totalMilliunits: 0,
                shippingMilliunits: null,
                taxMilliunits: null,
                promotionMilliunits: null,
                subtotalMilliunits: null,
                items: [{ asin: 'B091J6NVS5', title: 'SAFESKIN gloves', quantity: 1, itemTotalMilliunits: 46990 }],
            }),
        ).toBe(false);
    });

    it('does not re-fetch a complete order', () => {
        expect(
            amazonOrderNeedsRefetch({
                orderId: 'o-1',
                orderDate: null,
                totalMilliunits: 73920,
                shippingMilliunits: 0,
                taxMilliunits: 3920,
                promotionMilliunits: 0,
                subtotalMilliunits: null,
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

describe('completeness against the Amazon item subtotal', () => {
    // Synthetic: items 125.64, tax 10.53, total 136.17. The taxed total is more than $5
    // above the items, which the grand-total rule reads as a missing line, forever.
    const taxedOrder = {
        orderId: '111-0000000-0000001',
        orderDate: '2026-03-08',
        totalMilliunits: 136170,
        shippingMilliunits: 0,
        taxMilliunits: 10530,
        promotionMilliunits: null,
        subtotalMilliunits: 125640,
        items: [
            { asin: null, title: 'A', quantity: 1, itemTotalMilliunits: 100000 },
            { asin: null, title: 'B', quantity: 1, itemTotalMilliunits: 25640 },
        ],
    };

    it('treats items that match the subtotal as complete, whatever the tax', () => {
        expect(amazonOrderLooksIncomplete(taxedOrder)).toBe(false);
        expect(amazonOrderNeedsRefetch(taxedOrder)).toBe(false);
    });

    it('does not compare the items against the taxed bank charge either', () => {
        expect(amazonItemsLookIncomplete(taxedOrder.items, [taxedOrder], [taxedOrder.orderId], -136170)).toBe(false);
    });

    it('flags any shortfall against the subtotal, with no slop', () => {
        const missingALine = { ...taxedOrder, items: taxedOrder.items.slice(0, 1) };
        expect(amazonOrderLooksIncomplete(missingALine)).toBe(true);
        const shortByOneCent = {
            ...taxedOrder,
            items: [{ asin: null, title: 'A', quantity: 1, itemTotalMilliunits: 125630 }],
        };
        expect(amazonOrderLooksIncomplete(shortByOneCent)).toBe(true);
    });

    it('falls back to the grand-total rule when the subtotal is unknown', () => {
        expect(amazonOrderLooksIncomplete({ ...taxedOrder, subtotalMilliunits: null })).toBe(true);
    });
});
