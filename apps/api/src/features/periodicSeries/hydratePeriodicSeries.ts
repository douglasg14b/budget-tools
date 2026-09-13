import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import { listTransactionsByIds } from '../categorization/listTransactionsByIds';
import type { PeriodicSeriesWithoutRelated } from './parsePeriodicSeries';
import type { PeriodicSeriesDto, PeriodicSeriesListDto } from './periodicSeriesDtos';

/**
 * Unique related-transaction ids across a catalog, first-seen order.
 */
export function collectSeriesRelatedIds(series: readonly PeriodicSeriesWithoutRelated[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of series) {
        for (const relatedId of item.relatedTransactionIds) {
            if (seen.has(relatedId)) {
                continue;
            }
            seen.add(relatedId);
            ids.push(relatedId);
        }
    }
    return ids;
}

export function attachSeriesRelatedTransactions(
    series: readonly PeriodicSeriesWithoutRelated[],
    relatedById: ReadonlyMap<string, TransactionDetailDto>,
): PeriodicSeriesDto[] {
    return series.map((item) => ({
        ...item,
        relatedTransactions: item.relatedTransactionIds.flatMap((relatedId) => {
            const related = relatedById.get(relatedId);
            return related ? [related] : [];
        }),
    }));
}

export async function hydratePeriodicSeries(
    series: readonly PeriodicSeriesWithoutRelated[],
): Promise<PeriodicSeriesListDto> {
    const ids = collectSeriesRelatedIds(series);
    const related = await listTransactionsByIds(ids);
    const relatedById = new Map(related.map((transaction) => [transaction.id, transaction]));
    return { series: attachSeriesRelatedTransactions(series, relatedById) };
}
