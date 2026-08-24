import type { CategorizationQueueDto, CategorizationQueueItemDto } from '@budget-tools/web-sdk';

export type ClassifyQueueMergeDirection = 'replace' | 'older' | 'newer';

/**
 * Merges a windowed queue response into the classify working list.
 * Pending order is newest-first, so newer pages prepend and older pages append.
 */
export function mergeClassifyQueue(
    current: CategorizationQueueDto | undefined,
    incoming: CategorizationQueueDto,
    direction: ClassifyQueueMergeDirection,
): CategorizationQueueDto {
    if (!current || direction === 'replace') {
        return incoming;
    }

    const seen = new Set(current.items.map((item) => item.transaction.id));
    const incomingItems = incoming.items.filter((item) => !seen.has(item.transaction.id));

    if (direction === 'older') {
        return {
            ...incoming,
            items: [...current.items, ...incomingItems],
            hasMoreNewer: current.hasMoreNewer,
            hasMoreOlder: incoming.hasMoreOlder,
            hasMore: incoming.hasMoreOlder,
        };
    }

    return {
        ...incoming,
        items: [...incomingItems, ...current.items],
        hasMoreNewer: incoming.hasMoreNewer,
        hasMoreOlder: current.hasMoreOlder,
        hasMore: current.hasMoreOlder,
    };
}

export function pinFocusedQueueItem(
    visibleItems: readonly CategorizationQueueItemDto[],
    allItems: readonly CategorizationQueueItemDto[],
    focusedId: string | undefined,
): CategorizationQueueItemDto[] {
    if (!focusedId || visibleItems.some((item) => item.transaction.id === focusedId)) {
        return [...visibleItems];
    }

    const focused = allItems.find((item) => item.transaction.id === focusedId);
    if (!focused) {
        return [...visibleItems];
    }

    return [...visibleItems, focused];
}
