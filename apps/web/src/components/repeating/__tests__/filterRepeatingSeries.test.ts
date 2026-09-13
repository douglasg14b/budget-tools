import type { PeriodicSeriesDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { filterRepeatingSeries, isExpectedNextOverdue, mixedCategoryCount } from '../filterRepeatingSeries';

describe('filterRepeatingSeries', () => {
    it('sorts by last seen descending and filters mixed category', () => {
        const older = series({ id: 'a', payeeName: 'Adobe', lastDate: '2024-01-01', categoryStable: true });
        const newerMixed = series({
            id: 'b',
            payeeName: 'Hulu',
            lastDate: '2024-06-15',
            categoryStable: false,
        });
        const newerStable = series({
            id: 'c',
            payeeName: 'Netflix',
            lastDate: '2024-06-15',
            categoryStable: true,
        });

        expect(filterRepeatingSeries([older, newerMixed, newerStable], 'all').map((item) => item.id)).toEqual([
            'b',
            'c',
            'a',
        ]);
        expect(filterRepeatingSeries([older, newerMixed, newerStable], 'stable').map((item) => item.id)).toEqual([
            'c',
            'a',
        ]);
        expect(filterRepeatingSeries([older, newerMixed, newerStable], 'mixed').map((item) => item.id)).toEqual(['b']);
        expect(mixedCategoryCount([older, newerMixed, newerStable])).toBe(1);
    });
});

describe('isExpectedNextOverdue', () => {
    it('treats an expected date before today as overdue', () => {
        expect(isExpectedNextOverdue('2024-07-01', '2024-07-16')).toBe(true);
        expect(isExpectedNextOverdue('2024-07-16', '2024-07-16')).toBe(false);
        expect(isExpectedNextOverdue('2024-07-17', '2024-07-16')).toBe(false);
    });
});

function series(overrides: Partial<PeriodicSeriesDto>): PeriodicSeriesDto {
    return {
        id: 'id:payee-1|Monthly|-14990',
        payeeName: 'Netflix',
        cadence: 'Monthly',
        occurrenceCount: 6,
        medianAmount: -14990,
        lastDate: '2024-06-15',
        expectedNextDate: '2024-07-16',
        category: 'Streaming',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 1,
        relatedTransactionIds: [],
        relatedTransactions: [],
        ...overrides,
    };
}
