import { describe, expect, it } from 'vitest';

import { HttpError } from '../../travelWindows/HttpError';
import { parsePeriodicSeriesEnvelope } from '../parsePeriodicSeries';

const validSeries = {
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
    relatedTransactionIds: ['netflix-6', 'netflix-5'],
};

describe('parsePeriodicSeriesEnvelope', () => {
    it('parses a scorer catalog', () => {
        expect(parsePeriodicSeriesEnvelope({ series: [validSeries] })).toEqual({ series: [validSeries] });
    });

    it('allows a null category for mixed or unlabeled series', () => {
        const parsed = parsePeriodicSeriesEnvelope({
            series: [{ ...validSeries, category: null, categoryStable: false, categoryVoteShare: 0 }],
        });
        expect(parsed.series[0]?.category).toBeNull();
        expect(parsed.series[0]?.categoryStable).toBe(false);
    });

    it('rejects a missing series array', () => {
        expect(() => parsePeriodicSeriesEnvelope({})).toThrow(HttpError);
        expect(() => parsePeriodicSeriesEnvelope({})).toThrow('series must be an array');
    });

    it('rejects a non-ISO lastDate', () => {
        expect(() => parsePeriodicSeriesEnvelope({ series: [{ ...validSeries, lastDate: 'June 15, 2024' }] })).toThrow(
            'lastDate must be an ISO date (YYYY-MM-DD)',
        );
    });
});
