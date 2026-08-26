import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';

/** Unscored neighbors to score on each side of the focused row. */
export const PREDICT_RADIUS = 5;

/** Focus plus neighbors: `PREDICT_RADIUS` above and below. */
export const PREDICT_WINDOW_SIZE = PREDICT_RADIUS * 2 + 1;

/**
 * Unscored transaction ids in a contiguous window around the focused item.
 */
export function selectPredictWindowIds(
    items: readonly CategorizationQueueItemDto[],
    focusId: string | undefined,
    windowSize: number = PREDICT_WINDOW_SIZE,
): string[] {
    if (!focusId || items.length === 0 || windowSize <= 0) {
        return [];
    }

    const focusIndex = items.findIndex((item) => item.transaction.id === focusId);
    if (focusIndex === -1) {
        return [];
    }

    const back = Math.floor((windowSize - 1) / 2);
    let startIndex = focusIndex - back;
    let endIndexExclusive = startIndex + windowSize;
    if (startIndex < 0) {
        startIndex = 0;
        endIndexExclusive = Math.min(items.length, windowSize);
    } else if (endIndexExclusive > items.length) {
        endIndexExclusive = items.length;
        startIndex = Math.max(0, endIndexExclusive - windowSize);
    }

    const ids: string[] = [];
    for (const item of items.slice(startIndex, endIndexExclusive)) {
        if (!item.proposal) {
            ids.push(item.transaction.id);
        }
    }
    return ids;
}
