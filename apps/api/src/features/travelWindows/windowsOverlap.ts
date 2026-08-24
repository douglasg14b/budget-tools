export type WindowSpan = {
    readonly id?: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly accountIds: readonly string[];
};

/**
 * Two windows conflict when their inclusive date ranges overlap and they would
 * both match the same account (an empty account list matches every account).
 */
export function windowsOverlap(left: WindowSpan, right: WindowSpan): boolean {
    if (left.id && right.id && left.id === right.id) {
        return false;
    }
    if (left.startDate > right.endDate || right.startDate > left.endDate) {
        return false;
    }
    return accountSetsIntersect(left.accountIds, right.accountIds);
}

export function findOverlappingWindow(candidate: WindowSpan, existing: readonly WindowSpan[]): WindowSpan | undefined {
    return existing.find((window) => windowsOverlap(candidate, window));
}

function accountSetsIntersect(left: readonly string[], right: readonly string[]): boolean {
    if (left.length === 0 || right.length === 0) {
        return true;
    }
    const rightIds = new Set(right);
    return left.some((accountId) => rightIds.has(accountId));
}
