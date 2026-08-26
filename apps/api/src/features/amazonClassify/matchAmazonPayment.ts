import type { AmazonOrderRecord, AmazonPaymentRecord } from '../amazonOrders/data/amazonOrdersRepo';
import { addIsoDays } from '../amazonOrders/isoDate';

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
    if (order?.totalMilliunits != null && Math.abs(order.totalMilliunits) !== target) {
        return { kind: 'partial-order', payment, orderIds };
    }
    return { kind: 'payment', payment, orderIds };
}
