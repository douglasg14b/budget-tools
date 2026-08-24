export const PREFETCH_REMAINING_THRESHOLD = 10;

/**
 * True when the reviewer is close enough to the end of the scored set that the
 * next predict-json batch should start before they run out of rows.
 */
export function shouldPrefetchMore(position: number, itemCount: number, hasMore: boolean): boolean {
    if (!hasMore || itemCount === 0) {
        return false;
    }

    return itemCount - position <= PREFETCH_REMAINING_THRESHOLD;
}

/**
 * True when the reviewer is close enough to the newest loaded row that a
 * newer predict-json batch should start before they run out of rows.
 */
export function shouldPrefetchNewer(position: number, hasMoreNewer: boolean): boolean {
    if (!hasMoreNewer) {
        return false;
    }

    return position <= PREFETCH_REMAINING_THRESHOLD;
}
