import type { PeriodicCadence } from '../categorization/categorizationDtos';
import { HttpError } from '../travelWindows/HttpError';
import type { PeriodicSeriesDto } from './periodicSeriesDtos';

const PERIODIC_CADENCES = new Set<PeriodicCadence>(['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Yearly']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodicSeriesWithoutRelated = Omit<PeriodicSeriesDto, 'relatedTransactions'>;

export type PeriodicSeriesScorerEnvelope = {
    series: PeriodicSeriesWithoutRelated[];
};

/**
 * Parses the warm scorer GET /periodic-series envelope. Invalid shape is a loud 503.
 */
export function parsePeriodicSeriesEnvelope(value: unknown): PeriodicSeriesScorerEnvelope {
    if (typeof value !== 'object' || value === null) {
        throw new HttpError(503, 'warm scorer GET /periodic-series must return an object');
    }

    const envelope = value as Record<string, unknown>;
    if (!Array.isArray(envelope.series)) {
        throw new HttpError(503, 'warm scorer GET /periodic-series series must be an array');
    }

    return {
        series: envelope.series.map((item, index) => parseSeries(item, index)),
    };
}

function parseSeries(value: unknown, index: number): PeriodicSeriesWithoutRelated {
    if (typeof value !== 'object' || value === null) {
        throw new HttpError(503, `series[${index}] must be an object`);
    }

    const series = value as Record<string, unknown>;
    const cadence = series.cadence;
    if (typeof cadence !== 'string' || !PERIODIC_CADENCES.has(cadence as PeriodicCadence)) {
        throw new HttpError(503, `series[${index}].cadence is invalid`);
    }

    const relatedIds = series.relatedTransactionIds;
    if (!Array.isArray(relatedIds) || relatedIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        throw new HttpError(503, `series[${index}].relatedTransactionIds must be an array of non-empty strings`);
    }

    const category = series.category;
    if (category !== null && typeof category !== 'string') {
        throw new HttpError(503, `series[${index}].category must be a string or null`);
    }

    return {
        id: requireString(series.id, `series[${index}].id`),
        payeeName: requireString(series.payeeName, `series[${index}].payeeName`),
        cadence: cadence as PeriodicCadence,
        occurrenceCount: requireNumber(series.occurrenceCount, `series[${index}].occurrenceCount`),
        medianAmount: requireNumber(series.medianAmount, `series[${index}].medianAmount`),
        lastDate: requireIsoDate(series.lastDate, `series[${index}].lastDate`),
        expectedNextDate: requireIsoDate(series.expectedNextDate, `series[${index}].expectedNextDate`),
        category,
        categoryVoteShare: requireNumber(series.categoryVoteShare, `series[${index}].categoryVoteShare`),
        categoryStable: requireBoolean(series.categoryStable, `series[${index}].categoryStable`),
        cadenceFit: requireNumber(series.cadenceFit, `series[${index}].cadenceFit`),
        relatedTransactionIds: relatedIds,
    };
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new HttpError(503, `${path} must be a non-empty string`);
    }
    return value;
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new HttpError(503, `${path} must be a number`);
    }
    return value;
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new HttpError(503, `${path} must be a boolean`);
    }
    return value;
}

function requireIsoDate(value: unknown, path: string): string {
    const date = requireString(value, path);
    if (!ISO_DATE.test(date)) {
        throw new HttpError(503, `${path} must be an ISO date (YYYY-MM-DD)`);
    }
    return date;
}
