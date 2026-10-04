import type { AmazonItemRecord, AmazonOrderRecord } from '../amazonOrders/data/amazonOrdersRepo';

const INCOMPLETE_SLOP_MILLIUNITS = 5000;

/**
 * True when cached Amazon order details are missing line items.
 * A $0 / missing grand total is a failed total scrape, not proof that items are missing.
 *
 * When Amazon's own item subtotal is known, the items must add up to it exactly: that
 * is the figure they are summed into, so a shortfall means a line is missing. Without
 * it (orders the legacy MCP fetched), fall back to comparing against the grand total
 * with slop, which cannot tell missing items from tax.
 */
export function amazonOrderLooksIncomplete(order: AmazonOrderRecord): boolean {
    if (order.items.length === 0) {
        return true;
    }
    const itemSum = order.items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    if (hasSubtotal(order)) {
        return itemSum < Math.abs(order.subtotalMilliunits);
    }
    if (order.totalMilliunits == null || order.totalMilliunits === 0) {
        return false;
    }
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
    // Every order's items already match Amazon's subtotal. The bank charge also carries
    // tax and shipping, so comparing items against it would only re-raise a false alarm.
    if (orders.length > 0 && orders.every(hasSubtotal)) {
        return false;
    }
    if (bankAmountMilliunits == null || bankAmountMilliunits === 0) {
        return false;
    }
    const itemSum = items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    return itemSum + INCOMPLETE_SLOP_MILLIUNITS < Math.abs(bankAmountMilliunits);
}

function hasSubtotal(order: AmazonOrderRecord): order is AmazonOrderRecord & { subtotalMilliunits: number } {
    return order.subtotalMilliunits != null && order.subtotalMilliunits !== 0;
}
