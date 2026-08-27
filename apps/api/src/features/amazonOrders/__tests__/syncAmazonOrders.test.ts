import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import type { HttpError } from '../../travelWindows/HttpError';
import type { AmazonOrdersSource } from '../amazonOrdersSource';
import { deleteAllAmazonOrders, upsertAmazonOrder, upsertAmazonPayments } from '../data/amazonOrdersRepo';
import type { ParsedAmazonOrder, ParsedAmazonPayment } from '../parseAmazonMcp';
import { syncAmazonOrders } from '../syncAmazonOrders';

describe('syncAmazonOrders', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-sqlite-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('indexes payments through today in one walk, then only missing orders', async () => {
        const source = fakeSource();
        const first = await syncAmazonOrders(
            { from: '2026-02-01', to: '2026-02-10', today: '2026-08-26' },
            source,
            database,
        );
        expect(first.scrapedPaymentGaps).toEqual([{ start: '2026-02-01', end: '2026-08-26' }]);
        expect(source.transactionRanges).toEqual([{ start: '2026-02-01', end: '2026-08-26' }]);
        expect(source.orderCalls).toEqual(['111-2222222-3333333']);
        expect(first.payments).toBe(1);
        expect(first.orders).toBe(1);
        expect(first.coveredRanges).toEqual([{ start: '2026-02-01', end: '2026-08-26' }]);

        const second = await syncAmazonOrders(
            { from: '2026-03-01', to: '2026-03-07', today: '2026-08-26' },
            source,
            database,
        );
        expect(second.scrapedPaymentGaps).toEqual([]);
        expect(source.transactionRanges).toHaveLength(1);
        expect(source.orderCalls).toEqual(['111-2222222-3333333']);
        expect(second.fetchedOrderIds).toEqual([]);
    });

    it('pages from the oldest uncategorized Amazon day through today', async () => {
        const source = fakeSource();
        const result = await syncAmazonOrders(
            {
                from: '2026-06-20',
                to: '2026-06-26',
                oldestUncategorizedDate: '2026-01-15',
                today: '2026-08-26',
            },
            source,
            database,
        );
        expect(source.transactionRanges).toEqual([{ start: '2026-01-10', end: '2026-08-26' }]);
        expect(result.scrapedPaymentGaps).toEqual([{ start: '2026-01-10', end: '2026-08-26' }]);
        expect(result.coveredRanges).toEqual([{ start: '2026-01-10', end: '2026-08-26' }]);
        expect(source.orderCalls).toEqual([]);
    });

    it('re-fetches a stored order whose line items do not cover the total', async () => {
        const source = fakeSource();
        await upsertAmazonPayments([samplePayment], database);
        await upsertAmazonOrder(
            {
                ...sampleOrder,
                totalMilliunits: 0,
                items: [{ ...sampleOrder.items[0], itemTotalMilliunits: 19990, title: 'One of four' }],
            },
            database,
        );
        const result = await syncAmazonOrders(
            { from: '2026-02-01', to: '2026-02-10', today: '2026-08-26' },
            source,
            database,
        );
        expect(source.orderCalls).toEqual(['111-2222222-3333333']);
        expect(result.fetchedOrderIds).toEqual(['111-2222222-3333333']);
    });

    it('re-fetches orders after the order cache is cleared', async () => {
        const source = fakeSource();
        await syncAmazonOrders({ from: '2026-02-01', to: '2026-02-10', today: '2026-08-26' }, source, database);
        await deleteAllAmazonOrders(database);
        const again = await syncAmazonOrders(
            { from: '2026-02-01', to: '2026-02-10', today: '2026-08-26' },
            source,
            database,
        );
        expect(again.scrapedPaymentGaps).toEqual([]);
        expect(source.transactionRanges).toHaveLength(1);
        expect(source.orderCalls).toEqual(['111-2222222-3333333', '111-2222222-3333333']);
        expect(again.fetchedOrderIds).toEqual(['111-2222222-3333333']);
    });

    it('fails loud when Amazon is not authenticated', async () => {
        const source = fakeSource({ authenticated: false });
        await expect(
            syncAmazonOrders({ from: '2026-02-01', to: '2026-02-02', today: '2026-08-26' }, source, database),
        ).rejects.toMatchObject({ statusCode: 503, name: 'HttpError' } satisfies Partial<HttpError>);
        expect(source.transactionRanges).toEqual([]);
    });

    it('covers from the oldest scraped payment through today when paging did not finish', async () => {
        const source = fakeSource({ paginationComplete: false });
        const result = await syncAmazonOrders(
            { from: '2026-02-01', to: '2026-02-10', today: '2026-08-26' },
            source,
            database,
        );
        expect(result.coveredRanges).toEqual([{ start: '2026-02-03', end: '2026-08-26' }]);
    });
});

function fakeSource(options?: { authenticated?: boolean; paginationComplete?: boolean }): AmazonOrdersSource & {
    transactionRanges: { start: string; end: string }[];
    orderCalls: string[];
} {
    const source = {
        transactionRanges: [] as { start: string; end: string }[],
        orderCalls: [] as string[],
        async checkAuth() {
            return {
                authenticated: options?.authenticated ?? true,
                username: 'doug',
                message: options?.authenticated === false ? 'Not logged in' : 'Authenticated',
                loginUrl: options?.authenticated === false ? 'https://www.amazon.com/ap/signin' : null,
            };
        },
        async getTransactions(input: { range: { start: string; end: string } }) {
            source.transactionRanges.push(input.range);
            return { payments: [samplePayment], paginationComplete: options?.paginationComplete ?? true };
        },
        async getOrderDetails(input: { orderId: string }) {
            source.orderCalls.push(input.orderId);
            return sampleOrder;
        },
    };
    return source;
}

const samplePayment: ParsedAmazonPayment = {
    paymentDate: '2026-02-03',
    amountMilliunits: -47640,
    currency: 'USD',
    orderIds: ['111-2222222-3333333'],
    cardLast4: '1234',
    vendor: 'Amazon.com',
    isRefund: false,
    rawJson: '{}',
};

const sampleOrder: ParsedAmazonOrder = {
    orderId: '111-2222222-3333333',
    orderDate: '2026-02-01',
    totalMilliunits: 47640,
    shippingMilliunits: 0,
    taxMilliunits: 0,
    promotionMilliunits: 0,
    items: [
        {
            asin: 'B00SOAP',
            title: 'Dish soap',
            quantity: 1,
            itemTotalMilliunits: 47640,
            rawJson: '{}',
        },
    ],
    rawJson: '{}',
};
