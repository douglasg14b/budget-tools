import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import type { AmazonOrdersSource } from '../amazonOrdersSource';
import { getOrderWithItems, upsertAmazonOrder } from '../data/amazonOrdersRepo';
import { fetchAmazonOrderInvoices } from '../fetchAmazonOrderInvoices';
import type { ParsedAmazonOrder } from '../parseAmazonMcp';

describe('fetchAmazonOrderInvoices', () => {
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

    it('fetches missing orders and skips complete ones in missing-items mode', async () => {
        const source = fakeSource();
        await upsertAmazonOrder(completeOrder, database);
        const fetched = await fetchAmazonOrderInvoices(
            {
                orderIds: ['111-complete', '111-missing'],
                source,
                region: 'us',
                mode: 'missing-items',
            },
            database,
        );
        expect(fetched).toEqual(['111-missing']);
        expect(source.orderCalls).toEqual(['111-missing']);
        const stored = await getOrderWithItems('111-missing', database);
        expect(stored?.items).toHaveLength(1);
    });

    it('does not re-fetch a stored order that has line items in missing-items mode', async () => {
        const source = fakeSource();
        await upsertAmazonOrder(completeOrder, database);
        const fetched = await fetchAmazonOrderInvoices(
            {
                orderIds: ['111-complete'],
                source,
                region: 'us',
                mode: 'missing-items',
            },
            database,
        );
        expect(fetched).toEqual([]);
        expect(source.orderCalls).toEqual([]);
    });
});

function fakeSource(): AmazonOrdersSource & { orderCalls: string[] } {
    const source = {
        orderCalls: [] as string[],
        async checkAuth() {
            return { authenticated: true, username: 'doug', message: 'Authenticated', loginUrl: null };
        },
        async getTransactions() {
            return { payments: [], paginationComplete: true };
        },
        async getOrderDetails(input: { orderId: string }) {
            source.orderCalls.push(input.orderId);
            return {
                ...completeOrder,
                orderId: input.orderId,
            };
        },
    };
    return source;
}

const completeOrder: ParsedAmazonOrder = {
    orderId: '111-complete',
    orderDate: '2026-02-01',
    totalMilliunits: 19990,
    shippingMilliunits: 0,
    taxMilliunits: 0,
    promotionMilliunits: 0,
    items: [
        {
            asin: 'B00SOAP',
            title: 'Dish soap',
            quantity: 1,
            itemTotalMilliunits: 19990,
            rawJson: '{}',
        },
    ],
    rawJson: '{}',
};
