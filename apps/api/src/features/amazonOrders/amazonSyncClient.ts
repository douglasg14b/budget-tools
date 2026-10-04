import { AMAZON_ORDERS_SYNC_TIMEOUT_MS } from '../../environment';
import { HttpError } from '../travelWindows/HttpError';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import type { ParsedAmazonAuth, ParsedAmazonOrder, ParsedAmazonTransactions } from './parseAmazonMcp';
import {
    parseAmazonAuthPayload,
    parseAmazonOrderDetailsPayload,
    parseAmazonTransactionsPayload,
} from './parseAmazonMcp';

/** Both mean the cookie jar has no live session; the fix is the same. */
const COOKIE_JAR_CODES = new Set(['COOKIES_MISSING', 'COOKIES_EXPIRED']);

export const REFRESH_COOKIES_HINT =
    'Run `pnpm amazon:refresh-cookies` on the desktop to log in again (docs/amazon-cookie-refresh.md), then retry sync.';

/**
 * Amazon source backed by the `apps/amazon-sync` HTTP service.
 *
 * The service owns the session and cookie jar and serialises calls itself, so unlike the MCP
 * client there is no tool queue here. `region` is not sent: the service's domain is fixed by
 * its own `AMAZON_DOMAIN`.
 */
export function createAmazonSyncSource(baseUrl: string): AmazonOrdersSource {
    const getJson = (path: string) => getAmazonSyncJson(baseUrl, path);
    return {
        async checkAuth(): Promise<ParsedAmazonAuth> {
            const auth = parseAmazonAuthPayload(await getJson('/auth'));
            if (auth.authenticated) {
                return auth;
            }
            return { ...auth, message: [auth.message, REFRESH_COOKIES_HINT].filter(Boolean).join(' ') };
        },
        async getTransactions(input): Promise<ParsedAmazonTransactions> {
            const query = new URLSearchParams({ start: input.range.start, end: input.range.end });
            return parseAmazonTransactionsPayload(await getJson(`/transactions?${query}`));
        },
        async getOrderDetails(input): Promise<ParsedAmazonOrder> {
            const payload = await getJson(`/orders/${encodeURIComponent(input.orderId)}`);
            return parseAmazonOrderDetailsPayload(payload, input.orderId);
        },
    };
}

async function getAmazonSyncJson(baseUrl: string, path: string): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(AMAZON_ORDERS_SYNC_TIMEOUT_MS) });
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            throw new HttpError(503, `amazon-sync ${path} timed out after ${AMAZON_ORDERS_SYNC_TIMEOUT_MS}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpError(503, `amazon-sync is unreachable at ${baseUrl}: ${message}`);
    }

    const bodyText = await response.text();
    let body: unknown;
    try {
        body = JSON.parse(bodyText);
    } catch {
        throw new HttpError(503, `amazon-sync ${path} returned ${response.status} with a non-JSON body`);
    }
    if (response.ok) {
        return body;
    }

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const code = typeof record.code === 'string' ? record.code : 'UNKNOWN';
    const message = typeof record.message === 'string' ? record.message : bodyText.trim();
    if (COOKIE_JAR_CODES.has(code)) {
        throw new HttpError(503, `Amazon session is not authenticated (${code}). ${message} ${REFRESH_COOKIES_HINT}`);
    }
    throw new HttpError(503, `amazon-sync ${path} failed (${response.status} ${code}): ${message}`);
}
