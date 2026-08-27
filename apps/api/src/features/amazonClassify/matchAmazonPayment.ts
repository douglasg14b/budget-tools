import type { AmazonOrderRecord, AmazonPaymentRecord } from '../amazonOrders/data/amazonOrdersRepo';
import { addIsoDays, uncoveredIsoDateRanges } from '../amazonOrders/isoDate';

export type AmazonMatchKind = 'payment' | 'batched-orders' | 'partial-order' | 'unmatched';

export type AmazonPaymentMatch = {
    readonly kind: AmazonMatchKind;
    readonly payment: AmazonPaymentRecord | null;
    readonly orderIds: readonly string[];
};

const DAYS_AFTER_PAYMENT = 5;
const DAYS_BEFORE_PAYMENT = 1;

export function amazonPaymentDateWindow(bankDate: string): { earliestDate: string; latestDate: string } {
    return {
        earliestDate: addIsoDays(bankDate, -DAYS_AFTER_PAYMENT),
        latestDate: addIsoDays(bankDate, DAYS_BEFORE_PAYMENT),
    };
}

/** Coverage tracks scrape windows, not "Amazon charged us on this calendar day." */
export function amazonWindowNeedsSync(
    coveredRanges: readonly { readonly start: string; readonly end: string }[],
    window: { readonly earliestDate: string; readonly latestDate: string },
    paymentCount: number,
): boolean {
    if (paymentCount > 0) {
        return false;
    }
    return uncoveredIsoDateRanges(coveredRanges, { start: window.earliestDate, end: window.latestDate }).length > 0;
}

export function matchAmazonPayment(input: {
    readonly bankAmountMilliunits: number;
    readonly payments: readonly AmazonPaymentRecord[];
    readonly ordersById: ReadonlyMap<string, AmazonOrderRecord>;
}): AmazonPaymentMatch {
    const target = Math.abs(input.bankAmountMilliunits);
    const candidates = input.payments.filter((payment) => Math.abs(payment.amountMilliunits) === target);
    if (candidates.length !== 1) {
        return { kind: 'unmatched', payment: null, orderIds: [] };
    }

    const payment = candidates[0];
    if (!payment) {
        return { kind: 'unmatched', payment: null, orderIds: [] };
    }

    const orderIds = payment.orderIds;
    if (orderIds.length === 0) {
        return { kind: 'unmatched', payment, orderIds: [] };
    }
    if (orderIds.length > 1) {
        return { kind: 'batched-orders', payment, orderIds };
    }

    const order = input.ordersById.get(orderIds[0] ?? '');
    const orderTotal = order?.totalMilliunits;
    if (orderTotal != null && orderTotal !== 0 && Math.abs(orderTotal) !== target) {
        return { kind: 'partial-order', payment, orderIds };
    }
    return { kind: 'payment', payment, orderIds };
}
