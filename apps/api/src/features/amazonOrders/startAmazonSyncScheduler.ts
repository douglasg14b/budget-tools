import { AMAZON_SYNC_INTERVAL_MS, getAmazonSyncUrl } from '../../environment';
import { createAmazonSyncSource } from './amazonSyncClient';
import type { IsoDateRange } from './isoDate';
import { addIsoDays, utcTodayIso } from './isoDate';
import { oldestUncategorizedAmazonDate } from './oldestUncategorizedAmazonDate';
import { syncAmazonOrders } from './syncAmazonOrders';

/** Lets amazon-sync finish starting before the first run, and keeps boot itself quick. */
const FIRST_RUN_DELAY_MS = 2 * 60_000;
/** Always look at the last week, so new charges have orders cached before anyone classifies them. */
const RECENT_DAYS = 7;
/** Matches the classify panel's window: an order is charged up to five days before the bank date. */
const BANK_DATE_LOOKBACK_DAYS = 5;

let firstRun: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

/**
 * Syncs Amazon on a timer, so classify finds orders already cached instead of waiting on a scrape.
 *
 * Only with amazon-sync: the legacy MCP opens a browser window, which nothing unattended should
 * do. Off unless AMAZON_SYNC_INTERVAL_MS is set. Lives in the API rather than a Coolify cron so
 * it needs no auth token and no `docker exec`.
 */
export function startAmazonSyncScheduler(): void {
    const syncUrl = getAmazonSyncUrl();
    if (firstRun || timer || !syncUrl || AMAZON_SYNC_INTERVAL_MS <= 0) {
        return;
    }
    const source = createAmazonSyncSource(syncUrl);
    const run = () => void syncSafely(source);
    firstRun = setTimeout(run, FIRST_RUN_DELAY_MS);
    firstRun.unref?.();
    timer = setInterval(run, AMAZON_SYNC_INTERVAL_MS);
    timer.unref?.();
    console.log(`Amazon sync scheduled every ${Math.round(AMAZON_SYNC_INTERVAL_MS / 60_000)} min`);
}

export function stopAmazonSyncScheduler(): void {
    clearTimeout(firstRun);
    clearInterval(timer);
    firstRun = undefined;
    timer = undefined;
}

/** The last week, reaching back far enough to cover the oldest uncategorized Amazon charge. */
export function scheduledAmazonSyncRange(today: string, oldestUncategorized: string | null): IsoDateRange {
    const recent = addIsoDays(today, -RECENT_DAYS);
    const pending = oldestUncategorized ? addIsoDays(oldestUncategorized, -BANK_DATE_LOOKBACK_DAYS) : recent;
    return { start: pending < recent ? pending : recent, end: today };
}

async function syncSafely(source: ReturnType<typeof createAmazonSyncSource>): Promise<void> {
    // A run can outlast the interval on a first sync; never stack a second one on top.
    if (running) {
        return;
    }
    running = true;
    try {
        const oldest = await oldestUncategorizedAmazonDate();
        const range = scheduledAmazonSyncRange(utcTodayIso(), oldest);
        const result = await syncAmazonOrders(
            { from: range.start, to: range.end, oldestUncategorizedDate: oldest },
            source,
        );
        console.log(
            `Amazon sync ${range.start}..${range.end}: scraped ${result.scrapedPaymentGaps.length} payment gap(s), fetched ${result.fetchedOrderIds.length} order(s)`,
        );
    } catch (error) {
        // An expired jar lands here with the refresh hint in the message.
        console.error(`Scheduled Amazon sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        running = false;
    }
}
