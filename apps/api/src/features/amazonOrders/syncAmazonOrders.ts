import type { AppDatabaseClient } from '../../data-persistence/database';
import { getAppDatabase } from '../../data-persistence/database';
import { AMAZON_ORDERS_REGION } from '../../environment';
import { HttpError } from '../travelWindows/HttpError';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import {
    countAmazonCache,
    getAmazonSyncState,
    listOrderIdsFromPaymentsInRange,
    saveAmazonSyncState,
    upsertAmazonPayments,
} from './data/amazonOrdersRepo';
import { fetchAmazonOrderInvoices } from './fetchAmazonOrderInvoices';
import type { IsoDateRange } from './isoDate';
import {
    amazonPaymentIndexRange,
    coveredRangeFromScrapedPayments,
    isIsoDate,
    mergeIsoDateRanges,
    paymentScrapeRange,
    uncoveredIsoDateRanges,
    utcTodayIso,
} from './isoDate';

export type SyncAmazonOrdersInput = {
    readonly from: string;
    readonly to: string;
    readonly region?: string;
    readonly oldestUncategorizedDate?: string | null;
    readonly today?: string;
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
    const today = input.today && isIsoDate(input.today) ? input.today : utcTodayIso();
    const paymentIndex = amazonPaymentIndexRange({
        requested,
        oldestUncategorizedDate: input.oldestUncategorizedDate ?? null,
        today,
    });
    const state = await getAmazonSyncState(database);
    const paymentGaps = uncoveredIsoDateRanges(state.coveredRanges, paymentIndex);
    const scrape = paymentScrapeRange(paymentGaps, paymentIndex.end);

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

    let nextCovered = state.coveredRanges;
    const scrapedPaymentGaps: IsoDateRange[] = [];
    if (scrape) {
        const scraped = await source.getTransactions({ region, range: scrape });
        await upsertAmazonPayments(scraped.payments, database);
        scrapedPaymentGaps.push(scrape);
        const covered = coveredRangeFromScrapedPayments(
            scrape,
            scraped.payments.map((payment) => payment.paymentDate),
            scraped.paginationComplete,
        );
        if (covered) {
            nextCovered = mergeIsoDateRanges([...nextCovered, covered]);
        }
    }

    const orderIds = await listOrderIdsFromPaymentsInRange(requested, database);
    const fetchedOrderIds = await fetchAmazonOrderInvoices({ orderIds, source, region, mode: 'sync' }, database);

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
        scrapedPaymentGaps,
        fetchedOrderIds,
        payments: counts.payments,
        orders: counts.orders,
        items: counts.items,
        coveredRanges: nextCovered,
    };
}
