import { describe, expect, it } from 'vitest';

import type { AmazonOrderRecord, AmazonPaymentRecord } from '../../amazonOrders/data/amazonOrdersRepo';
import { amazonWindowNeedsSync, matchAmazonPayment } from '../matchAmazonPayment';

describe('matchAmazonPayment', () => {
    const order: AmazonOrderRecord = {
        orderId: '111-2222222-3333333',
        orderDate: '2026-02-01',
        totalMilliunits: -50000,
        shippingMilliunits: 0,
        taxMilliunits: 0,
        promotionMilliunits: 0,
        items: [{ asin: 'A', title: 'Soap', quantity: 1, itemTotalMilliunits: -50000 }],
    };

    it('matches a unique payment to one order', () => {
        const payment = makePayment(-50000, ['111-2222222-3333333']);
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -50000,
                payments: [payment],
                ordersById: new Map([[order.orderId, order]]),
            }),
        ).toEqual({ kind: 'payment', payment, orderIds: ['111-2222222-3333333'] });
    });

    it('marks batched charges when one payment lists several orders', () => {
        const payment = makePayment(-80000, ['111-2222222-3333333', '111-4444444-5555555']);
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -80000,
                payments: [payment],
                ordersById: new Map(),
            }).kind,
        ).toBe('batched-orders');
    });

    it('does not treat a $0 scraped total as a partial order', () => {
        const payment = makePayment(-35990, ['113-7991450-8305811']);
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -35990,
                payments: [payment],
                ordersById: new Map([
                    [
                        '113-7991450-8305811',
                        {
                            ...order,
                            orderId: '113-7991450-8305811',
                            totalMilliunits: 0,
                            items: [{ asin: 'B0H8JBNCSQ', title: 'Pillow', quantity: 1, itemTotalMilliunits: 35990 }],
                        },
                    ],
                ]),
            }).kind,
        ).toBe('payment');
    });

    it('marks a partial order when the payment is not the full order total', () => {
        const payment = makePayment(-20000, ['111-2222222-3333333']);
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -20000,
                payments: [payment],
                ordersById: new Map([[order.orderId, order]]),
            }).kind,
        ).toBe('partial-order');
    });

    it('is unmatched when two payments share the amount', () => {
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -50000,
                payments: [makePayment(-50000, ['a']), makePayment(-50000, ['b'])],
                ordersById: new Map(),
            }).kind,
        ).toBe('unmatched');
    });

    it('is unmatched when no payment matches the amount', () => {
        expect(
            matchAmazonPayment({
                bankAmountMilliunits: -50000,
                payments: [makePayment(-12000, ['111-2222222-3333333'])],
                ordersById: new Map(),
            }).kind,
        ).toBe('unmatched');
    });

    it('does not treat a lookback day without a charge as unsynced when payments exist', () => {
        expect(amazonWindowNeedsSync([], { earliestDate: '2026-08-20', latestDate: '2026-08-26' }, 3)).toBe(false);
    });

    it('needs a sync when the window has no payments and is not covered', () => {
        expect(amazonWindowNeedsSync([], { earliestDate: '2026-06-21', latestDate: '2026-06-27' }, 0)).toBe(true);
    });
});

function makePayment(amountMilliunits: number, orderIds: string[]): AmazonPaymentRecord {
    return {
        id: `${amountMilliunits}|${orderIds.join(',')}`,
        paymentDate: '2026-02-03',
        amountMilliunits,
        currency: 'USD',
        orderIds,
        cardLast4: '1234',
        vendor: 'Amazon.com',
        isRefund: amountMilliunits > 0,
    };
}
