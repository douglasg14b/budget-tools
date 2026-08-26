import { describe, expect, it } from 'vitest';

import {
    amazonPaymentId,
    parseAmazonAuthPayload,
    parseAmazonOrderDetailsPayload,
    parseAmazonTransactionsPayload,
} from '../parseAmazonMcp';

describe('parseAmazonMcp', () => {
    it('parses payment transactions from the MCP envelope', () => {
        const payments = parseAmazonTransactionsPayload({
            status: 'success',
            transactions: [
                {
                    date: '2026-02-03T12:00:00.000Z',
                    orderIds: ['111-2222222-3333333', '111-2222222-3333333'],
                    amount: { amount: -47.64, currency: 'USD' },
                    cardInfo: 'Visa ••••1234',
                    vendor: 'Amazon.com',
                },
            ],
        });
        expect(payments).toHaveLength(1);
        expect(payments[0]).toMatchObject({
            paymentDate: '2026-02-03',
            amountMilliunits: -47640,
            currency: 'USD',
            orderIds: ['111-2222222-3333333'],
            cardLast4: '1234',
            vendor: 'Amazon.com',
            isRefund: false,
        });
        expect(
            amazonPaymentId({
                paymentDate: '2026-02-03',
                amountMilliunits: -47640,
                orderIds: ['111-2222222-3333333'],
                cardLast4: '1234',
            }),
        ).toBe('2026-02-03|-47640|111-2222222-3333333|1234');
    });

    it('parses order details and item totals', () => {
        const order = parseAmazonOrderDetailsPayload(
            {
                status: 'success',
                order: {
                    id: '111-2222222-3333333',
                    date: '2026-02-01T00:00:00.000Z',
                    total: { amount: 50 },
                    shipping: { amount: 0 },
                    tax: { amount: 2.36 },
                },
                items: [
                    {
                        name: 'Dish soap',
                        asin: 'B00SOAP',
                        quantity: 2,
                        unitPrice: { amount: 5 },
                    },
                ],
            },
            '111-2222222-3333333',
        );
        expect(order.orderId).toBe('111-2222222-3333333');
        expect(order.totalMilliunits).toBe(50000);
        expect(order.taxMilliunits).toBe(2360);
        expect(order.items).toEqual([
            {
                asin: 'B00SOAP',
                title: 'Dish soap',
                quantity: 2,
                itemTotalMilliunits: 10000,
                rawJson: expect.any(String),
            },
        ]);
    });

    it('parses auth status', () => {
        expect(
            parseAmazonAuthPayload({
                authenticated: false,
                message: 'Not logged in',
                loginUrl: 'https://www.amazon.com/ap/signin',
            }),
        ).toEqual({
            authenticated: false,
            username: null,
            message: 'Not logged in',
            loginUrl: 'https://www.amazon.com/ap/signin',
        });
    });
});
