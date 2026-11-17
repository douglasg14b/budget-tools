import { HttpError } from '../travelWindows/HttpError';

/**
 * How many days either side of the receipt date the "Search charges" list may reach, beyond the
 * default bank window. Receipts often carry a wrong or missing date, so the user can widen it.
 */
export const RECEIPT_SEARCH_EXTRA_DAYS = [0, 14, 30, 90, 365] as const;

/** Newest-first cap on a widened listing, so a year of ledger rows never floods the page. */
export const RECEIPT_SEARCH_MAX_ROWS = 1500;

/** `undefined` means the default window. Anything off the allowed list is a 400. */
export function parseReceiptSearchExtraDays(value: number | undefined): number {
    if (value === undefined) {
        return 0;
    }
    if (!(RECEIPT_SEARCH_EXTRA_DAYS as readonly number[]).includes(value)) {
        throw new HttpError(400, `extraDays must be one of ${RECEIPT_SEARCH_EXTRA_DAYS.join(', ')}`);
    }
    return value;
}
