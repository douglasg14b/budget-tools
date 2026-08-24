import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';

/**
 * Newest transaction date first, then id. Ignores proposal tier so classify
 * walks a single timeline instead of restarting dates at each tier boundary.
 */
export function sortQueueItemsByDateDesc(items: readonly CategorizationQueueItemDto[]): CategorizationQueueItemDto[] {
    return [...items].sort((left, right) => {
        if (left.transaction.date !== right.transaction.date) {
            return left.transaction.date < right.transaction.date ? 1 : -1;
        }
        return left.transaction.id.localeCompare(right.transaction.id);
    });
}
