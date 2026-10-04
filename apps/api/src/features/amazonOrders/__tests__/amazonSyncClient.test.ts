import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HttpError } from '../../travelWindows/HttpError';
import { createAmazonSyncSource, REFRESH_COOKIES_HINT } from '../amazonSyncClient';

const BASE = 'http://amazon-sync:4022';

function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): string {
    return String((fetchMock.mock.calls[0] as unknown[])[0]);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('createAmazonSyncSource', () => {
    it('reports an authenticated session', async () => {
        stubFetch(200, { authenticated: true, username: null, message: null, loginUrl: null });
        const auth = await createAmazonSyncSource(BASE).checkAuth('us');
        expect(auth).toMatchObject({ authenticated: true, message: null });
    });

    it('adds the refresh hint when the cookie jar has expired', async () => {
        stubFetch(200, {
            authenticated: false,
            username: null,
            message: 'Amazon redirected to login.',
            loginUrl: null,
            code: 'COOKIES_EXPIRED',
        });
        const auth = await createAmazonSyncSource(BASE).checkAuth('us');
        expect(auth.authenticated).toBe(false);
        expect(auth.message).toBe(`Amazon redirected to login. ${REFRESH_COOKIES_HINT}`);
    });

    it('requests the range and keeps purchases negative', async () => {
        const fetchMock = stubFetch(200, {
            status: 'success',
            paginationComplete: true,
            transactions: [
                {
                    date: '2026-03-10',
                    amount: -20,
                    orderIds: ['111-0000000-0000001'],
                    cardInfo: '0042',
                    vendor: 'AMZN Mktp US',
                },
                { date: '2026-03-11', amount: -5.99, orderIds: [], cardInfo: '0042', vendor: 'Amazon Kids+' },
            ],
        });
        const result = await createAmazonSyncSource(BASE).getTransactions({
            region: 'us',
            range: { start: '2026-03-01', end: '2026-03-31' },
        });
        expect(requestedUrl(fetchMock)).toBe(`${BASE}/transactions?start=2026-03-01&end=2026-03-31`);
        expect(result.paginationComplete).toBe(true);
        expect(result.payments.map((p) => [p.amountMilliunits, p.isRefund, p.orderIds, p.cardLast4])).toEqual([
            [-20000, false, ['111-0000000-0000001'], '0042'],
            [-5990, false, [], '0042'],
        ]);
    });

    it('parses order details, including a total recovered from charges and a positive promotion', async () => {
        const fetchMock = stubFetch(200, {
            status: 'success',
            order: {
                id: '111-0000000-0000001',
                date: '2026-03-08',
                total: 21.63,
                shipping: 0,
                tax: 0,
                promotion: 1.14,
            },
            items: [{ title: 'Test widget', asin: 'B000TEST01', quantity: 3, unitPrice: 7.59, itemTotal: 22.77 }],
        });
        const order = await createAmazonSyncSource(BASE).getOrderDetails({
            region: 'us',
            orderId: '111-0000000-0000001',
        });
        expect(requestedUrl(fetchMock)).toBe(`${BASE}/orders/111-0000000-0000001`);
        expect(order).toMatchObject({
            orderId: '111-0000000-0000001',
            orderDate: '2026-03-08',
            totalMilliunits: 21630,
            promotionMilliunits: 1140,
        });
        expect(order.items.map((i) => [i.quantity, i.itemTotalMilliunits])).toEqual([[3, 22770]]);
    });

    it('keeps a missing total null so the order is not mistaken for a $0 order', async () => {
        stubFetch(200, {
            status: 'success',
            order: {
                id: '111-0000000-0000001',
                date: '2026-03-08',
                total: null,
                shipping: null,
                tax: 1,
                promotion: null,
            },
            items: [{ title: 'Test widget', asin: null, quantity: 1, unitPrice: 5, itemTotal: 5 }],
        });
        const order = await createAmazonSyncSource(BASE).getOrderDetails({
            region: 'us',
            orderId: '111-0000000-0000001',
        });
        expect(order.totalMilliunits).toBeNull();
    });

    it('turns an expired jar on a data call into a 503 that says how to fix it', async () => {
        stubFetch(503, { status: 'error', code: 'COOKIES_EXPIRED', message: 'Amazon redirected to login.' });
        const error = await createAmazonSyncSource(BASE)
            .getOrderDetails({ region: 'us', orderId: '111-0000000-0000001' })
            .then(
                () => {
                    throw new Error('expected getOrderDetails to reject');
                },
                (caught: unknown) => caught as HttpError,
            );
        expect(error).toMatchObject({ name: 'HttpError', statusCode: 503 });
        expect(error.message).toContain('COOKIES_EXPIRED');
        expect(error.message).toContain(REFRESH_COOKIES_HINT);
    });

    it('reports other service failures with their code', async () => {
        stubFetch(502, { status: 'error', code: 'AMAZON_ERROR', message: 'grand_total could not be parsed' });
        await expect(
            createAmazonSyncSource(BASE).getOrderDetails({ region: 'us', orderId: '111-0000000-0000001' }),
        ).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('AMAZON_ERROR') });
    });

    it('does not tell anyone to log in again when only the cookie store is down', async () => {
        stubFetch(503, {
            status: 'error',
            code: 'COOKIE_STORE_UNAVAILABLE',
            message: 'Could not fetch the Amazon cookie jar.',
        });
        const error = await createAmazonSyncSource(BASE)
            .checkAuth('us')
            .then(
                () => {
                    throw new Error('expected checkAuth to reject');
                },
                (caught: unknown) => caught as HttpError,
            );
        expect(error).toMatchObject({ statusCode: 503, message: expect.stringContaining('COOKIE_STORE_UNAVAILABLE') });
        expect(error.message).not.toContain(REFRESH_COOKIES_HINT);
    });

    it('reports an unreachable service as a 503', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError('fetch failed');
            }),
        );
        await expect(createAmazonSyncSource(BASE).checkAuth('us')).rejects.toMatchObject({
            statusCode: 503,
            message: expect.stringContaining('unreachable'),
        });
    });
});
