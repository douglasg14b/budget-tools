import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { IsoDateRange } from '../isoDate';
import type { ParsedAmazonOrder, ParsedAmazonPayment } from '../parseAmazonMcp';
import { amazonPaymentId } from '../parseAmazonMcp';

export type AmazonPaymentRecord = {
    readonly id: string;
    readonly paymentDate: string;
    readonly amountMilliunits: number;
    readonly currency: string;
    readonly orderIds: readonly string[];
    readonly cardLast4: string | null;
    readonly vendor: string | null;
    readonly isRefund: boolean;
};

export type AmazonItemRecord = {
    readonly asin: string | null;
    readonly title: string;
    readonly quantity: number;
    readonly itemTotalMilliunits: number;
};

export type AmazonOrderRecord = {
    readonly orderId: string;
    readonly orderDate: string | null;
    readonly totalMilliunits: number | null;
    readonly shippingMilliunits: number | null;
    readonly taxMilliunits: number | null;
    readonly promotionMilliunits: number | null;
    readonly items: readonly AmazonItemRecord[];
};

export type AmazonSyncStateRecord = {
    readonly lastAuthCheck: string | null;
    readonly lastAuthenticated: boolean;
    readonly coveredRanges: IsoDateRange[];
};

export async function upsertAmazonPayments(
    payments: readonly ParsedAmazonPayment[],
    db?: AppDatabaseClient,
): Promise<number> {
    const database = db ?? (await getAppDatabase());
    if (payments.length === 0) {
        return 0;
    }
    await database
        .insertInto('amazon_payments')
        .values(
            payments.map((payment) => ({
                id: amazonPaymentId(payment),
                paymentDate: payment.paymentDate,
                amountMilliunits: payment.amountMilliunits,
                currency: payment.currency,
                orderIdsJson: JSON.stringify(payment.orderIds),
                cardLast4: payment.cardLast4,
                vendor: payment.vendor,
                isRefund: payment.isRefund,
                rawJson: payment.rawJson,
            })),
        )
        .onConflict((conflict) =>
            conflict.column('id').doUpdateSet({
                paymentDate: (eb) => eb.ref('excluded.paymentDate'),
                amountMilliunits: (eb) => eb.ref('excluded.amountMilliunits'),
                currency: (eb) => eb.ref('excluded.currency'),
                orderIdsJson: (eb) => eb.ref('excluded.orderIdsJson'),
                cardLast4: (eb) => eb.ref('excluded.cardLast4'),
                vendor: (eb) => eb.ref('excluded.vendor'),
                isRefund: (eb) => eb.ref('excluded.isRefund'),
                rawJson: (eb) => eb.ref('excluded.rawJson'),
            }),
        )
        .execute();
    return payments.length;
}

export async function upsertAmazonOrder(order: ParsedAmazonOrder, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await database
        .insertInto('amazon_orders')
        .values({
            orderId: order.orderId,
            orderDate: order.orderDate,
            totalMilliunits: order.totalMilliunits,
            shippingMilliunits: order.shippingMilliunits,
            taxMilliunits: order.taxMilliunits,
            promotionMilliunits: order.promotionMilliunits,
            rawJson: order.rawJson,
        })
        .onConflict((conflict) =>
            conflict.column('orderId').doUpdateSet({
                orderDate: (eb) => eb.ref('excluded.orderDate'),
                totalMilliunits: (eb) => eb.ref('excluded.totalMilliunits'),
                shippingMilliunits: (eb) => eb.ref('excluded.shippingMilliunits'),
                taxMilliunits: (eb) => eb.ref('excluded.taxMilliunits'),
                promotionMilliunits: (eb) => eb.ref('excluded.promotionMilliunits'),
                rawJson: (eb) => eb.ref('excluded.rawJson'),
            }),
        )
        .execute();

    await database.deleteFrom('amazon_order_items').where('orderId', '=', order.orderId).execute();
    if (order.items.length === 0) {
        return;
    }
    await database
        .insertInto('amazon_order_items')
        .values(
            order.items.map((item, index) => ({
                id: `${order.orderId}:${index}`,
                orderId: order.orderId,
                lineIndex: index,
                asin: item.asin,
                title: item.title,
                quantity: item.quantity,
                itemTotalMilliunits: item.itemTotalMilliunits,
                rawJson: item.rawJson,
            })),
        )
        .execute();
}

export async function listStoredOrderIds(orderIds: readonly string[], db?: AppDatabaseClient): Promise<Set<string>> {
    const database = db ?? (await getAppDatabase());
    if (orderIds.length === 0) {
        return new Set();
    }
    const rows = await database
        .selectFrom('amazon_orders')
        .select('orderId')
        .where('orderId', 'in', [...orderIds])
        .execute();
    return new Set(rows.map((row) => row.orderId));
}

export async function listOrderIdsFromPaymentsInRange(range: IsoDateRange, db?: AppDatabaseClient): Promise<string[]> {
    const database = db ?? (await getAppDatabase());
    const rows = await database
        .selectFrom('amazon_payments')
        .select('orderIdsJson')
        .where('paymentDate', '>=', range.start)
        .where('paymentDate', '<=', range.end)
        .execute();
    const ids = new Set<string>();
    for (const row of rows) {
        const parsed = parseOrderIdsJson(row.orderIdsJson);
        for (const orderId of parsed) {
            ids.add(orderId);
        }
    }
    return [...ids];
}

export async function listPaymentsInDateWindow(
    input: {
        readonly earliestDate: string;
        readonly latestDate: string;
    },
    db?: AppDatabaseClient,
): Promise<AmazonPaymentRecord[]> {
    const database = db ?? (await getAppDatabase());
    const rows = await database
        .selectFrom('amazon_payments')
        .selectAll()
        .where('paymentDate', '>=', input.earliestDate)
        .where('paymentDate', '<=', input.latestDate)
        .orderBy('paymentDate', 'asc')
        .execute();
    return rows.map(mapPaymentRow);
}

export async function getOrderWithItems(
    orderId: string,
    db?: AppDatabaseClient,
): Promise<AmazonOrderRecord | undefined> {
    const database = db ?? (await getAppDatabase());
    const order = await database
        .selectFrom('amazon_orders')
        .selectAll()
        .where('orderId', '=', orderId)
        .executeTakeFirst();
    if (!order) {
        return undefined;
    }
    const items = await database
        .selectFrom('amazon_order_items')
        .selectAll()
        .where('orderId', '=', orderId)
        .orderBy('lineIndex', 'asc')
        .execute();
    return {
        orderId: order.orderId,
        orderDate: order.orderDate,
        totalMilliunits: order.totalMilliunits,
        shippingMilliunits: order.shippingMilliunits,
        taxMilliunits: order.taxMilliunits,
        promotionMilliunits: order.promotionMilliunits,
        items: items.map((item) => ({
            asin: item.asin,
            title: item.title,
            quantity: item.quantity,
            itemTotalMilliunits: item.itemTotalMilliunits,
        })),
    };
}

export async function deleteAllAmazonOrders(db?: AppDatabaseClient): Promise<{
    orders: number;
    items: number;
}> {
    const database = db ?? (await getAppDatabase());
    const before = await countAmazonCache(database);
    await database.deleteFrom('amazon_order_items').execute();
    await database.deleteFrom('amazon_orders').execute();
    return { orders: before.orders, items: before.items };
}

export async function countAmazonCache(db?: AppDatabaseClient): Promise<{
    payments: number;
    orders: number;
    items: number;
}> {
    const database = db ?? (await getAppDatabase());
    const payments = await database
        .selectFrom('amazon_payments')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
    const orders = await database
        .selectFrom('amazon_orders')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
    const items = await database
        .selectFrom('amazon_order_items')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
    return {
        payments: Number(payments.count),
        orders: Number(orders.count),
        items: Number(items.count),
    };
}

export async function getAmazonSyncState(db?: AppDatabaseClient): Promise<AmazonSyncStateRecord> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('amazon_sync_state')
        .selectAll()
        .where('id', '=', 1)
        .executeTakeFirstOrThrow();
    return {
        lastAuthCheck: row.lastAuthCheck,
        lastAuthenticated: row.lastAuthenticated,
        coveredRanges: parseCoveredRanges(row.coveredRangesJson),
    };
}

export async function saveAmazonSyncState(state: AmazonSyncStateRecord, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await database
        .updateTable('amazon_sync_state')
        .set({
            lastAuthCheck: state.lastAuthCheck,
            lastAuthenticated: state.lastAuthenticated,
            coveredRangesJson: JSON.stringify(state.coveredRanges),
        })
        .where('id', '=', 1)
        .execute();
}

function mapPaymentRow(row: {
    id: string;
    paymentDate: string;
    amountMilliunits: number;
    currency: string;
    orderIdsJson: string;
    cardLast4: string | null;
    vendor: string | null;
    isRefund: boolean;
}): AmazonPaymentRecord {
    return {
        id: row.id,
        paymentDate: row.paymentDate,
        amountMilliunits: row.amountMilliunits,
        currency: row.currency,
        orderIds: parseOrderIdsJson(row.orderIdsJson),
        cardLast4: row.cardLast4,
        vendor: row.vendor,
        isRefund: row.isRefund,
    };
}

function parseOrderIdsJson(value: string): string[] {
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((entry): entry is string => typeof entry === 'string');
    } catch {
        return [];
    }
}

function parseCoveredRanges(value: string): IsoDateRange[] {
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const ranges: IsoDateRange[] = [];
        for (const entry of parsed) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const record = entry as Record<string, unknown>;
            if (typeof record.start === 'string' && typeof record.end === 'string') {
                ranges.push({ start: record.start, end: record.end });
            }
        }
        return ranges;
    } catch {
        return [];
    }
}
