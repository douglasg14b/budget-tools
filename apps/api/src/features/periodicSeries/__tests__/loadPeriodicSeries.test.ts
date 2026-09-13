import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HttpError } from '../../travelWindows/HttpError';
import { loadPeriodicSeries } from '../loadPeriodicSeries';

vi.mock('../../categorization/listTransactionsByIds', () => ({
    listTransactionsByIds: vi.fn(async (ids: readonly string[]) =>
        ids.map((id) => ({
            id,
            date: '2024-06-15',
            amount: -14990,
            memo: null,
            cleared: 'cleared',
            approved: true,
            accountId: 'acct-1',
            accountName: 'Checking',
            payeeId: null,
            payeeName: 'Netflix',
            categoryId: 'cat-1',
            categoryName: 'Streaming',
            importId: null,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        })),
    ),
}));

const validEnvelope = {
    series: [
        {
            id: 'id:payee-1|Monthly|-14990',
            payeeName: 'Netflix',
            cadence: 'Monthly',
            occurrenceCount: 2,
            medianAmount: -14990,
            lastDate: '2024-06-15',
            expectedNextDate: '2024-07-16',
            category: 'Streaming',
            categoryVoteShare: 1,
            categoryStable: true,
            cadenceFit: 1,
            relatedTransactionIds: ['netflix-6', 'netflix-5'],
        },
    ],
};

describe('loadPeriodicSeries', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.CATEGORIZATION_SCORER_URL;
    });

    it('returns 503 when the warm scorer URL is missing', async () => {
        delete process.env.CATEGORIZATION_SCORER_URL;
        await expect(loadPeriodicSeries()).rejects.toMatchObject({
            statusCode: 503,
            name: 'HttpError',
        } satisfies Partial<HttpError>);
    });

    it('fetches the scorer catalog and hydrates members in id order', async () => {
        process.env.CATEGORIZATION_SCORER_URL = 'http://127.0.0.1:4021';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify(validEnvelope),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await loadPeriodicSeries();

        expect(fetchMock).toHaveBeenCalledWith(
            'http://127.0.0.1:4021/periodic-series',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(result.series).toHaveLength(1);
        expect(result.series[0]?.relatedTransactions.map((transaction) => transaction.id)).toEqual([
            'netflix-6',
            'netflix-5',
        ]);
    });

    it('surfaces warm scorer HTTP failures', async () => {
        process.env.CATEGORIZATION_SCORER_URL = 'http://127.0.0.1:4021';
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'boom',
            }),
        );

        await expect(loadPeriodicSeries()).rejects.toThrow('warm scorer GET /periodic-series failed (500): boom');
    });
});
