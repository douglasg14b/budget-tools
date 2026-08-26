import type { AppDatabaseClient } from '../../data-persistence/database';
import { getAppDatabase } from '../../data-persistence/database';
import { AMAZON_ORDERS_REGION } from '../../environment';
import { amazonOrderLooksIncomplete } from '../amazonClassify/amazonOrderLooksIncomplete';
import { deleteAmazonSplitOverlaysForOrders } from '../amazonClassify/data/amazonSplitOverlayRepo';
import { HttpError } from '../travelWindows/HttpError';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import {
    countAmazonCache,
    getAmazonSyncState,
    getOrderWithItems,
    listOrderIdsFromPaymentsInRange,
    listStoredOrderIds,
    saveAmazonSyncState,
    upsertAmazonOrder,
    upsertAmazonPayments,
} from './data/amazonOrdersRepo';
import type { IsoDateRange } from './isoDate';
import { isIsoDate, mergeIsoDateRanges, uncoveredIsoDateRanges } from './isoDate';

export type SyncAmazonOrdersInput = {
    readonly from: string;
    readonly to: string;
    readonly region?: string;
};

export type SyncAmazonOrdersResult = {
    readonly region: string;
    readonly from: string;
    readonly to: string;
    readonly scrapedPaymentGaps: IsoDateRange[];
    readonly fetchedOrderIds: string[];
    readonly payments: number;
    readonly orders: number;
    readonly items: number;
    readonly coveredRanges: IsoDateRange[];
};

export async function syncAmazonOrders(
    input: SyncAmazonOrdersInput,
    source: AmazonOrdersSource,
    db?: AppDatabaseClient,
): Promise<SyncAmazonOrdersResult> {
    const from = input.from.trim();
    const to = input.to.trim();
    if (!isIsoDate(from) || !isIsoDate(to)) {
        throw new HttpError(422, 'from and to must be ISO dates (YYYY-MM-DD)');
    }
    if (from > to) {
        throw new HttpError(422, 'from must be on or before to');
    }

    const database = db ?? (await getAppDatabase());
    const region = input.region?.trim() || AMAZON_ORDERS_REGION;
    const requested: IsoDateRange = { start: from, end: to };
    const state = await getAmazonSyncState(database);
    const paymentGaps = uncoveredIsoDateRanges(state.coveredRanges, requested);

    const auth = await source.checkAuth(region);
    await saveAmazonSyncState(
        {
            ...state,
            lastAuthCheck: new Date().toISOString(),
            lastAuthenticated: auth.authenticated,
        },
        database,
    );
    if (!auth.authenticated) {
        const login = auth.loginUrl ? ` Log in at ${auth.loginUrl}.` : '';
        throw new HttpError(
            503,
            `Amazon session is not authenticated.${login} Finish login in the Chromium window, then retry sync.`,
        );
    }

    for (const gap of paymentGaps) {
        const payments = await source.getTransactions({ region, range: gap });
        await upsertAmazonPayments(payments, database);
    }

    const orderIds = await listOrderIdsFromPaymentsInRange(requested, database);
    const stored = await listStoredOrderIds(orderIds, database);
    const toFetch: string[] = [];
    for (const orderId of orderIds) {
        if (!stored.has(orderId)) {
            toFetch.push(orderId);
            continue;
        }
        const existing = await getOrderWithItems(orderId, database);
        if (!existing || amazonOrderLooksIncomplete(existing)) {
            toFetch.push(orderId);
        }
    }
    const fetchedOrderIds: string[] = [];
    for (const orderId of toFetch) {
        const order = await source.getOrderDetails({ region, orderId });
        await upsertAmazonOrder(order, database);
        fetchedOrderIds.push(orderId);
    }
    const refetched = toFetch.filter((orderId) => stored.has(orderId));
    if (refetched.length > 0) {
        await deleteAmazonSplitOverlaysForOrders(refetched, database);
    }

    const nextCovered = mergeIsoDateRanges([...state.coveredRanges, requested]);
    await saveAmazonSyncState(
        {
            lastAuthCheck: new Date().toISOString(),
            lastAuthenticated: true,
            coveredRanges: nextCovered,
        },
        database,
    );

    const counts = await countAmazonCache(database);
    return {
        region,
        from,
        to,
        scrapedPaymentGaps: paymentGaps,
        fetchedOrderIds,
        payments: counts.payments,
        orders: counts.orders,
        items: counts.items,
        coveredRanges: nextCovered,
    };
}
