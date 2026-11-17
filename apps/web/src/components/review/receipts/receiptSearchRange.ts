/**
 * How far past the receipt's date "Search charges" may reach. Must stay in step with
 * `RECEIPT_SEARCH_EXTRA_DAYS` on the API, which rejects any other value.
 */
export const RECEIPT_SEARCH_RANGES = [
    { extraDays: 0, label: 'Receipt date window' },
    { extraDays: 14, label: '± 2 weeks' },
    { extraDays: 30, label: '± 1 month' },
    { extraDays: 90, label: '± 3 months' },
    { extraDays: 365, label: '± 1 year' },
] as const;

export const DEFAULT_RECEIPT_SEARCH_EXTRA_DAYS = 0;

/** Rows drawn before the user types a query; a widened list can run to a thousand charges. */
export const RECEIPT_SEARCH_VISIBLE_ROWS = 50;

export function receiptSearchRangeLabel(extraDays: number): string {
    return RECEIPT_SEARCH_RANGES.find((range) => range.extraDays === extraDays)?.label ?? 'Receipt date window';
}

/** Rows to draw, newest first as the API sent them, and how many were held back. */
export function limitSearchHits<T>(hits: readonly T[], query: string | undefined): { rows: T[]; hidden: number } {
    if (query?.trim() || hits.length <= RECEIPT_SEARCH_VISIBLE_ROWS) {
        return { rows: [...hits], hidden: 0 };
    }
    return { rows: hits.slice(0, RECEIPT_SEARCH_VISIBLE_ROWS), hidden: hits.length - RECEIPT_SEARCH_VISIBLE_ROWS };
}

/** What to say when the list is empty. Names the range so a wrong receipt date is easy to spot. */
export function emptySearchCopy(input: {
    readonly candidateCount: number;
    readonly extraDays: number;
    readonly hasPurchaseDate: boolean;
}): string {
    if (input.candidateCount > 0) {
        return 'No charges match that search.';
    }
    if (input.extraDays === 0) {
        return input.hasPurchaseDate
            ? 'No charges in the receipt date window. Widen the range if the date looks wrong.'
            : 'This receipt has no date, so there is no window to search. Pick a wider range to look around when it was captured.';
    }
    return `No charges found within ${receiptSearchRangeLabel(input.extraDays)}. Try a wider range.`;
}
