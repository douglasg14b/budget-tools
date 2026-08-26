import type { CategorizationQueueItemDto, TransactionDetailDto } from './categorizationDtos';
import { listTransactionsByIds } from './listTransactionsByIds';

type QueueItemWithoutRelated = Omit<CategorizationQueueItemDto, 'relatedTransactions'>;

/**
 * Unique related-transaction ids across a queue, first-seen order.
 */
export function collectRelatedTransactionIds(items: readonly QueueItemWithoutRelated[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of items) {
        for (const relatedId of item.proposal?.periodicMatch?.relatedTransactionIds ?? []) {
            if (seen.has(relatedId)) {
                continue;
            }
            seen.add(relatedId);
            ids.push(relatedId);
        }
    }
    return ids;
}

/**
 * Attaches related ledger rows in each item's `relatedTransactionIds` order.
 */
export function attachRelatedTransactions(
    items: readonly QueueItemWithoutRelated[],
    relatedById: ReadonlyMap<string, TransactionDetailDto>,
): CategorizationQueueItemDto[] {
    return items.map((item) => ({
        ...item,
        relatedTransactions: (item.proposal?.periodicMatch?.relatedTransactionIds ?? []).flatMap((relatedId) => {
            const related = relatedById.get(relatedId);
            return related ? [related] : [];
        }),
    }));
}

/**
 * Loads related periodic-series transactions for a scored queue.
 */
export async function hydrateRelatedTransactions(
    items: readonly QueueItemWithoutRelated[],
): Promise<CategorizationQueueItemDto[]> {
    const ids = collectRelatedTransactionIds(items);
    const related = await listTransactionsByIds(ids);
    return attachRelatedTransactions(items, new Map(related.map((transaction) => [transaction.id, transaction])));
}
