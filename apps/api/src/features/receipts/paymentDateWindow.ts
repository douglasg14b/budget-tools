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

export function isDateInPaymentWindow(purchaseDate: string, bankDate: string): boolean {
    const window = paymentDateWindow(bankDate);
    return purchaseDate >= window.earliestDate && purchaseDate <= window.latestDate;
}
