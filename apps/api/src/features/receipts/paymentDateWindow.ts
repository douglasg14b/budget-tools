import { addIsoDays, PAYMENT_MATCH_LOOKAHEAD_DAYS, PAYMENT_MATCH_LOOKBACK_DAYS } from '../amazonOrders/isoDate';

export type IsoDateWindow = {
    readonly earliestDate: string;
    readonly latestDate: string;
};

/**
 * Bank date −5 … +1, same span as Amazon payment matching.
 */
export function paymentDateWindow(bankDate: string): IsoDateWindow {
    return {
        earliestDate: addIsoDays(bankDate, -PAYMENT_MATCH_LOOKBACK_DAYS),
        latestDate: addIsoDays(bankDate, PAYMENT_MATCH_LOOKAHEAD_DAYS),
    };
}

/**
 * Bank posting dates whose payment window contains `purchaseDate`.
 */
export function bankDateWindowForPurchaseDate(purchaseDate: string): IsoDateWindow {
    return {
        earliestDate: addIsoDays(purchaseDate, -PAYMENT_MATCH_LOOKAHEAD_DAYS),
        latestDate: addIsoDays(purchaseDate, PAYMENT_MATCH_LOOKBACK_DAYS),
    };
}

/**
 * The default bank window for `purchaseDate`, grown to at least `extraDays` on either side.
 * Always a superset of `bankDateWindowForPurchaseDate`, so `0` leaves it unchanged. Used only to
 * list search candidates; the matcher still judges each pair against the strict window.
 */
export function widenedBankDateWindow(purchaseDate: string, extraDays: number): IsoDateWindow {
    const base = bankDateWindowForPurchaseDate(purchaseDate);
    if (extraDays <= 0) {
        return base;
    }
    const earliest = addIsoDays(purchaseDate, -extraDays);
    const latest = addIsoDays(purchaseDate, extraDays);
    return {
        earliestDate: earliest < base.earliestDate ? earliest : base.earliestDate,
        latestDate: latest > base.latestDate ? latest : base.latestDate,
    };
}

export function isDateInPaymentWindow(purchaseDate: string, bankDate: string): boolean {
    const window = paymentDateWindow(bankDate);
    return purchaseDate >= window.earliestDate && purchaseDate <= window.latestDate;
}
