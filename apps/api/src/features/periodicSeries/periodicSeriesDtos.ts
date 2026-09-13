import type { PeriodicCadence, TransactionDetailDto } from '../categorization/categorizationDtos';

export type PeriodicSeriesDto = {
    id: string;
    payeeName: string;
    cadence: PeriodicCadence;
    occurrenceCount: number;
    medianAmount: number;
    lastDate: string;
    expectedNextDate: string;
    /** Majority historical category, or null when the series has no usable labels. */
    category: string | null;
    categoryVoteShare: number;
    categoryStable: boolean;
    cadenceFit: number;
    relatedTransactionIds: string[];
    relatedTransactions: TransactionDetailDto[];
};

export type PeriodicSeriesListDto = {
    series: PeriodicSeriesDto[];
};
