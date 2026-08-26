import type { AmazonItemRecord, AmazonOrderRecord } from '../amazonOrders/data/amazonOrdersRepo';

const INCOMPLETE_SLOP_MILLIUNITS = 5000;

/**
 * True when cached Amazon order details are missing line items or a usable total.
 * A single cheap item against a much larger grand total is the usual scrape miss.
 */
export function amazonOrderLooksIncomplete(order: AmazonOrderRecord): boolean {
    if (order.items.length === 0) {
        return true;
    }
    if (order.totalMilliunits == null || order.totalMilliunits === 0) {
        return true;
    }
    const itemSum = order.items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    return itemSum + INCOMPLETE_SLOP_MILLIUNITS < Math.abs(order.totalMilliunits);
}

export function amazonItemsLookIncomplete(
    items: readonly AmazonItemRecord[],
    orders: readonly AmazonOrderRecord[],
): boolean {
    if (orders.some((order) => amazonOrderLooksIncomplete(order))) {
        return true;
    }
    return items.length === 0 && orders.length > 0;
}
