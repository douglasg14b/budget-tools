import type { AmazonItemRecord, AmazonOrderRecord } from '../amazonOrders/data/amazonOrdersRepo';

const INCOMPLETE_SLOP_MILLIUNITS = 5000;

/**
 * True when cached Amazon order details are missing line items.
 * A $0 / missing grand total is a failed total scrape, not proof that items are missing.
 */
export function amazonOrderLooksIncomplete(order: AmazonOrderRecord): boolean {
    if (order.items.length === 0) {
        return true;
    }
    if (order.totalMilliunits == null || order.totalMilliunits === 0) {
        return false;
    }
    const itemSum = order.items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    return itemSum + INCOMPLETE_SLOP_MILLIUNITS < Math.abs(order.totalMilliunits);
}

/** Sync should re-fetch when invoice totals never landed, even if line items exist. */
export function amazonOrderNeedsRefetch(order: AmazonOrderRecord): boolean {
    if (order.items.length === 0) {
        return true;
    }
    if (order.totalMilliunits == null || order.totalMilliunits === 0) {
        return true;
    }
    return amazonOrderLooksIncomplete(order);
}

export function amazonItemsLookIncomplete(
    items: readonly AmazonItemRecord[],
    orders: readonly AmazonOrderRecord[],
    expectedOrderIds: readonly string[] = [],
    bankAmountMilliunits?: number,
): boolean {
    if (items.length === 0) {
        return true;
    }
    const storedIds = new Set(orders.map((order) => order.orderId));
    if (expectedOrderIds.some((orderId) => !storedIds.has(orderId))) {
        return true;
    }
    if (orders.some((order) => amazonOrderLooksIncomplete(order))) {
        return true;
    }
    if (bankAmountMilliunits == null || bankAmountMilliunits === 0) {
        return false;
    }
    const itemSum = items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    return itemSum + INCOMPLETE_SLOP_MILLIUNITS < Math.abs(bankAmountMilliunits);
}
