import type { AppDatabaseClient } from '../../data-persistence/database';
import { getAppDatabase } from '../../data-persistence/database';
import { amazonOrderNeedsRefetch } from '../amazonClassify/amazonOrderLooksIncomplete';
import { deleteAmazonSplitOverlaysForOrders } from '../amazonClassify/data/amazonSplitOverlayRepo';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import type { AmazonOrderRecord } from './data/amazonOrdersRepo';
import { getOrderWithItems, upsertAmazonOrder } from './data/amazonOrdersRepo';

export type InvoiceRefetchMode = 'sync' | 'missing-items';

/**
 * Fetch print-invoice details for order IDs that are missing or incomplete.
 * Does not walk Your Payments.
 */
export async function fetchAmazonOrderInvoices(
    input: {
        readonly orderIds: readonly string[];
        readonly source: AmazonOrdersSource;
        readonly region: string;
        readonly mode: InvoiceRefetchMode;
    },
    db?: AppDatabaseClient,
): Promise<string[]> {
    const database = db ?? (await getAppDatabase());
    const toFetch: string[] = [];
    for (const orderId of input.orderIds) {
        const existing = await getOrderWithItems(orderId, database);
        if (needsInvoiceFetch(existing, input.mode)) {
            toFetch.push(orderId);
        }
    }
    const fetchedOrderIds: string[] = [];
    for (const orderId of toFetch) {
        const order = await input.source.getOrderDetails({ region: input.region, orderId });
        await upsertAmazonOrder(order, database);
        fetchedOrderIds.push(orderId);
    }
    if (fetchedOrderIds.length > 0) {
        await deleteAmazonSplitOverlaysForOrders(fetchedOrderIds, database);
    }
    return fetchedOrderIds;
}

function needsInvoiceFetch(order: AmazonOrderRecord | undefined, mode: InvoiceRefetchMode): boolean {
    if (!order) {
        return true;
    }
    switch (mode) {
        case 'sync':
            return amazonOrderNeedsRefetch(order);
        case 'missing-items':
            return order.items.length === 0;
    }
}
