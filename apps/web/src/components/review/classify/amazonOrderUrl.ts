const AMAZON_ORDER_HOST = 'https://www.amazon.com';

/**
 * Amazon order-details page for a US marketplace order id (`111-2222222-3333333`).
 */
export function amazonOrderUrl(orderId: string): string {
    const trimmed = orderId.trim();
    return `${AMAZON_ORDER_HOST}/gp/your-account/order-details?orderID=${encodeURIComponent(trimmed)}`;
}
