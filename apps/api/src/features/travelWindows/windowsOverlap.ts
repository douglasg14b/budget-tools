export type WindowSpan = {
    readonly id?: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly accountId: string | null;
};

/**
 * Two windows conflict when their inclusive date ranges overlap and they would
 * both match the same account (unscoped windows match every account).
 */
export function windowsOverlap(left: WindowSpan, right: WindowSpan): boolean {
    if (left.id && right.id && left.id === right.id) {
        return false;
    }
    if (left.startDate > right.endDate || right.startDate > left.endDate) {
        return false;
    }
    if (left.accountId === null || right.accountId === null) {
        return true;
    }
    return left.accountId === right.accountId;
}

export function findOverlappingWindow(candidate: WindowSpan, existing: readonly WindowSpan[]): WindowSpan | undefined {
    return existing.find((window) => windowsOverlap(candidate, window));
}
