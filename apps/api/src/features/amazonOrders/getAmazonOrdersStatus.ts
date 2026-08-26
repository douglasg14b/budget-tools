import type { AppDatabaseClient } from '../../data-persistence/database';
import { getAppDatabase } from '../../data-persistence/database';
import { AMAZON_ORDERS_REGION, getAmazonOrdersMcpEntry } from '../../environment';
import { countAmazonCache, getAmazonSyncState } from './data/amazonOrdersRepo';
import type { IsoDateRange } from './isoDate';

export type AmazonOrdersStatusResult = {
    readonly region: string;
    readonly mcpConfigured: boolean;
    readonly lastAuthCheck: string | null;
    readonly lastAuthenticated: boolean;
    readonly coveredRanges: IsoDateRange[];
    readonly payments: number;
    readonly orders: number;
    readonly items: number;
};

export async function getAmazonOrdersStatus(db?: AppDatabaseClient): Promise<AmazonOrdersStatusResult> {
    const database = db ?? (await getAppDatabase());
    const state = await getAmazonSyncState(database);
    const counts = await countAmazonCache(database);
    return {
        region: AMAZON_ORDERS_REGION,
        mcpConfigured: Boolean(getAmazonOrdersMcpEntry()),
        lastAuthCheck: state.lastAuthCheck,
        lastAuthenticated: state.lastAuthenticated,
        coveredRanges: state.coveredRanges,
        payments: counts.payments,
        orders: counts.orders,
        items: counts.items,
    };
}
