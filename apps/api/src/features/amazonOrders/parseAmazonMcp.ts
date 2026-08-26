import { moneyToMilliunits } from './moneyToMilliunits';

export type ParsedAmazonPayment = {
    readonly paymentDate: string;
    readonly amountMilliunits: number;
    readonly currency: string;
    readonly orderIds: readonly string[];
    readonly cardLast4: string | null;
    readonly vendor: string | null;
    readonly isRefund: boolean;
    readonly rawJson: string;
};

export type ParsedAmazonItem = {
    readonly asin: string | null;
    readonly title: string;
    readonly quantity: number;
    readonly itemTotalMilliunits: number;
    readonly rawJson: string;
};

export type ParsedAmazonOrder = {
    readonly orderId: string;
    readonly orderDate: string | null;
    readonly totalMilliunits: number | null;
    readonly shippingMilliunits: number | null;
    readonly taxMilliunits: number | null;
    readonly promotionMilliunits: number | null;
    readonly items: readonly ParsedAmazonItem[];
    readonly rawJson: string;
};

export type ParsedAmazonAuth = {
    readonly authenticated: boolean;
    readonly username: string | null;
    readonly message: string | null;
    readonly loginUrl: string | null;
};

export function amazonPaymentId(payment: {
    readonly paymentDate: string;
    readonly amountMilliunits: number;
    readonly orderIds: readonly string[];
    readonly cardLast4: string | null;
}): string {
    return [
        payment.paymentDate,
        String(payment.amountMilliunits),
        [...payment.orderIds].sort().join(','),
        payment.cardLast4 ?? '',
    ].join('|');
}

export function parseMcpToolJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new Error('Amazon MCP tool result was not valid JSON', { cause: error });
    }
}

export function parseAmazonAuthPayload(payload: unknown): ParsedAmazonAuth {
    const record = asRecord(payload);
    if (!record) {
        throw new Error('Amazon MCP auth payload was not an object');
    }
    return {
        authenticated: record.authenticated === true,
        username: optionalText(record.username),
        message: optionalText(record.message),
        loginUrl: optionalText(record.loginUrl),
    };
}

export function parseAmazonTransactionsPayload(payload: unknown): ParsedAmazonPayment[] {
    const record = asRecord(payload);
    if (!record) {
        throw new Error('Amazon MCP transactions payload was not an object');
    }
    if (record.status === 'error') {
        throw new Error(optionalText(record.error) ?? optionalText(record.message) ?? 'Amazon MCP transactions failed');
    }
    const rows = Array.isArray(record.transactions) ? record.transactions : [];
    const payments: ParsedAmazonPayment[] = [];
    for (const row of rows) {
        const parsed = parsePaymentRow(row);
        if (parsed) {
            payments.push(parsed);
        }
    }
    return payments;
}

export function parseAmazonOrderDetailsPayload(payload: unknown, requestedOrderId: string): ParsedAmazonOrder {
    const record = asRecord(payload);
    if (!record) {
        throw new Error('Amazon MCP order payload was not an object');
    }
    if (record.status === 'error' && !record.order) {
        const errors = Array.isArray(record.errors) ? record.errors.map(String).join('; ') : '';
        throw new Error(errors || optionalText(record.message) || `Amazon order ${requestedOrderId} was not found`);
    }

    const order = asRecord(record.order);
    const orderId = optionalText(order?.id) ?? optionalText(order?.orderId) ?? requestedOrderId;
    const itemsSource = Array.isArray(record.items)
        ? record.items
        : order && Array.isArray(order.items)
          ? order.items
          : [];

    const items: ParsedAmazonItem[] = [];
    for (const [index, item] of itemsSource.entries()) {
        const parsed = parseItemRow(item, index);
        if (parsed) {
            items.push(parsed);
        }
    }

    return {
        orderId,
        orderDate: isoDateFromUnknown(order?.date),
        totalMilliunits: moneyToMilliunits(order?.total ?? order?.grandTotal),
        shippingMilliunits: moneyToMilliunits(order?.shipping),
        taxMilliunits: moneyToMilliunits(order?.tax ?? order?.vat),
        promotionMilliunits: moneyToMilliunits(order?.promotion),
        items,
        rawJson: JSON.stringify(payload),
    };
}

function parsePaymentRow(row: unknown): ParsedAmazonPayment | null {
    const record = asRecord(row);
    if (!record) {
        return null;
    }
    const paymentDate = isoDateFromUnknown(record.date);
    const amountMilliunits = moneyToMilliunits(record.amount);
    if (!paymentDate || amountMilliunits == null) {
        return null;
    }
    const orderIds = parseOrderIds(record.orderIds);
    const currency = optionalText(asRecord(record.amount)?.currency) ?? optionalText(record.currency) ?? 'USD';
    return {
        paymentDate,
        amountMilliunits,
        currency,
        orderIds,
        cardLast4: cardLast4(optionalText(record.cardInfo)),
        vendor: optionalText(record.vendor),
        isRefund: amountMilliunits > 0,
        rawJson: JSON.stringify(row),
    };
}

function parseItemRow(row: unknown, index: number): ParsedAmazonItem | null {
    const record = asRecord(row);
    if (!record) {
        return null;
    }
    const title = optionalText(record.name) ?? optionalText(record.title) ?? `Item ${index + 1}`;
    const quantityRaw = record.quantity;
    const quantity =
        typeof quantityRaw === 'number' && Number.isFinite(quantityRaw) && quantityRaw > 0
            ? Math.round(quantityRaw)
            : 1;
    const lineTotal = moneyToMilliunits(record.itemTotal);
    const unit = moneyToMilliunits(record.unitPrice);
    const itemTotalMilliunits = lineTotal ?? (unit != null ? unit * quantity : 0);
    return {
        asin: optionalText(record.asin),
        title,
        quantity,
        itemTotalMilliunits,
        rawJson: JSON.stringify(row),
    };
}

function parseOrderIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const ids: string[] = [];
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            ids.push(entry.trim());
        }
    }
    return [...new Set(ids)];
}

function cardLast4(cardInfo: string | null): string | null {
    if (!cardInfo) {
        return null;
    }
    const match = cardInfo.match(/(\d{4})\s*$/);
    return match?.[1] ?? null;
}

function isoDateFromUnknown(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    const iso = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}
