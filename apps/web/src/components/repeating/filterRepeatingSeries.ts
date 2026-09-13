import type { PeriodicSeriesDto } from '@budget-tools/web-sdk';

export type RepeatingCategoryFilter = 'all' | 'stable' | 'mixed';

/**
 * Last-seen descending, then payee. Mixed filter is series the detector does not trust for auto-categorize.
 */
export function filterRepeatingSeries(
    series: readonly PeriodicSeriesDto[],
    filter: RepeatingCategoryFilter,
): PeriodicSeriesDto[] {
    const sorted = [...series].sort((left, right) => {
        const byDate = right.lastDate.localeCompare(left.lastDate);
        if (byDate !== 0) {
            return byDate;
        }
        return left.payeeName.localeCompare(right.payeeName);
    });

    if (filter === 'stable') {
        return sorted.filter((item) => item.categoryStable);
    }
    if (filter === 'mixed') {
        return sorted.filter((item) => !item.categoryStable);
    }
    return sorted;
}

export function mixedCategoryCount(series: readonly PeriodicSeriesDto[]): number {
    return series.filter((item) => !item.categoryStable).length;
}

export function isExpectedNextOverdue(expectedNextDate: string, todayIso: string): boolean {
    return expectedNextDate < todayIso;
}

export function localIsoDate(now = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
