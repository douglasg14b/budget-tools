import {
    AMAZON_ORDERS_REGION,
    getAmazonOrdersMcpEntry,
    getOpenRouterApiKey,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
} from '../../environment';
import { getAmazonOrdersSource } from '../amazonOrders/amazonMcpClient';
import type { AmazonOrderRecord, AmazonPaymentRecord } from '../amazonOrders/data/amazonOrdersRepo';
import { getAmazonSyncState, getOrderWithItems, listPaymentsInDateWindow } from '../amazonOrders/data/amazonOrdersRepo';
import { fetchAmazonOrderInvoices } from '../amazonOrders/fetchAmazonOrderInvoices';
import { listCategories } from '../categories/listCategories';
import { getScoredQueueItem } from '../categorization/llm/getScoredQueueItem';
import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import { assignableCategories } from '../categorization/llm/nearbyCategories';
import { completeOpenRouterJson } from '../categorization/llm/openRouterClient';
import { collapsedSplitCategory } from '../splits/splitLines';
import { HttpError } from '../travelWindows/HttpError';
import { alignAmountToBank } from './alignAmountToBank';
import { allocateAmazonItemsToBank } from './allocateAmazonItemsToBank';
import type { AmazonMatchedOrderDto, AmazonMatchedPaymentDto, AmazonSplitOverlayDto } from './amazonClassifyDtos';
import { amazonItemsLookIncomplete } from './amazonOrderLooksIncomplete';
import type { AmazonMatchedItem } from './attachItemCategories';
import { attachItemCategories } from './attachItemCategories';
import { buildAmazonSplitPrompt } from './buildAmazonSplitPrompt';
import { getAmazonSplitOverlay, upsertAmazonSplitOverlay } from './data/amazonSplitOverlayRepo';
import { isAmazonTransaction } from './isAmazonTransaction';
import { amazonPaymentDateWindow, amazonWindowNeedsSync, matchAmazonPayment } from './matchAmazonPayment';
import { AMAZON_SPLIT_SCHEMA, parseAmazonSplitCompletion } from './parseAmazonSplitCompletion';

const OPENROUTER_TIMEOUT_MS = 20_000;

export async function suggestAmazonSplits(transactionId: string, signal?: AbortSignal): Promise<AmazonSplitOverlayDto> {
    const trimmedId = transactionId.trim();
    if (!trimmedId) {
        throw new LlmSuggestError(422, 'transactionId is required');
    }

    const scored = await getScoredQueueItem(trimmedId);
    const tx = scored.transaction;
    if (!isAmazonTransaction(tx)) {
        throw new LlmSuggestError(422, 'Transaction is not an Amazon payee');
    }

    const window = amazonPaymentDateWindow(tx.date);
    const sync = await getAmazonSyncState();
    const payments = await listPaymentsInDateWindow({
        earliestDate: window.earliestDate,
        latestDate: window.latestDate,
    });
    if (amazonWindowNeedsSync(sync.coveredRanges, window, payments.length)) {
        return {
            transactionId: tx.id,
            dataStatus: 'not-synced',
            match: 'unmatched',
            payment: null,
            orders: [],
            orderIds: [],
            items: [],
            lines: [],
            collapsed: false,
            rationale: null,
            notes: `Amazon payments for ${window.earliestDate} to ${window.latestDate} are not cached yet. Sync Amazon indexes payments from your oldest uncategorized Amazon charge through today; later charges skip that walk.`,
        };
    }
    const absTarget = Math.abs(tx.amount);
    const windowPayments = payments.filter((payment) => Math.abs(payment.amountMilliunits) === absTarget);

    const orderIds = [...new Set(windowPayments.flatMap((payment) => [...payment.orderIds]))];
    let orders = await loadOrdersForIds(orderIds);
    let ordersById = new Map(orders.map((order) => [order.orderId, order]));
    let match = matchAmazonPayment({
        bankAmountMilliunits: tx.amount,
        payments: windowPayments,
        ordersById,
    });

    if (match.kind !== 'unmatched' && getAmazonOrdersMcpEntry()) {
        const matchedForFetch = match.orderIds
            .map((orderId) => ordersById.get(orderId))
            .filter((order): order is AmazonOrderRecord => Boolean(order));
        if (amazonItemsLookIncomplete(flattenItems(matchedForFetch), matchedForFetch, match.orderIds, tx.amount)) {
            try {
                const fetched = await fetchAmazonOrderInvoices({
                    orderIds: match.orderIds,
                    source: await getAmazonOrdersSource(),
                    region: AMAZON_ORDERS_REGION,
                    mode: 'missing-items',
                });
                if (fetched.length > 0) {
                    orders = await loadOrdersForIds(orderIds);
                    ordersById = new Map(orders.map((order) => [order.orderId, order]));
                    match = matchAmazonPayment({
                        bankAmountMilliunits: tx.amount,
                        payments: windowPayments,
                        ordersById,
                    });
                }
            } catch (error) {
                if (error instanceof HttpError) {
                    return {
                        transactionId: tx.id,
                        dataStatus: 'not-synced',
                        match: match.kind,
                        payment: toPaymentDto(match.payment),
                        orders: ordersOrIds(matchedForFetch, match.orderIds, tx.amount, match.payment, []),
                        orderIds: [...match.orderIds],
                        items: [],
                        lines: [],
                        collapsed: false,
                        rationale: null,
                        notes: error.message,
                    };
                }
                throw error;
            }
        }
    }

    const matchedOrders = match.orderIds
        .map((orderId) => ordersById.get(orderId))
        .filter((order): order is AmazonOrderRecord => Boolean(order));
    const items = flattenItems(matchedOrders);
    const signedItems = items.map((item) => ({
        ...item,
        itemTotalMilliunits: alignAmountToBank(item.itemTotalMilliunits, tx.amount),
    }));
    const billedItems = allocateAmazonItemsToBank(signedItems, tx.amount);

    if (match.kind === 'unmatched') {
        return {
            transactionId: tx.id,
            dataStatus: 'ready',
            match: 'unmatched',
            payment: toPaymentDto(match.payment),
            orders: ordersOrIds(matchedOrders, match.orderIds, tx.amount, match.payment, signedItems),
            orderIds: [...match.orderIds],
            items: attachItemCategories(signedItems, []),
            lines: [],
            collapsed: false,
            rationale: null,
            notes:
                match.payment && match.payment.orderIds.length === 0
                    ? 'Amazon found a payment for this amount but listed no order IDs. Sync Amazon, then retry.'
                    : 'No unique Amazon payment matched this bank charge. Split it by hand if you want.',
        };
    }

    if (amazonItemsLookIncomplete(items, matchedOrders, match.orderIds, tx.amount)) {
        return {
            transactionId: tx.id,
            dataStatus: 'not-synced',
            match: match.kind,
            payment: toPaymentDto(match.payment),
            orders: ordersOrIds(matchedOrders, match.orderIds, tx.amount, match.payment, signedItems),
            orderIds: [...match.orderIds],
            items: attachItemCategories(signedItems, []),
            lines: [],
            collapsed: false,
            rationale: null,
            notes: missingAmazonDetailsNote(match.orderIds, matchedOrders, items.length),
        };
    }

    const stored = await getAmazonSplitOverlay(tx.id, scored.fingerprint);
    if (stored && stored.items.length > 0) {
        return {
            ...stored,
            orders: toOrderDtos(matchedOrders, tx.amount, match.payment, signedItems),
            items: stored.items.map((item, index) => ({
                ...item,
                amount: billedItems[index]?.itemTotalMilliunits ?? item.amount,
            })),
            notes: listVsChargedNote(signedItems, tx.amount) ?? stored.notes,
        };
    }

    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
        throw new LlmSuggestError(503, 'OPENROUTER_API_KEY is not configured');
    }

    const catalogDto = await listCategories();
    const catalog = assignableCategories(catalogDto.groups);
    if (catalog.length === 0) {
        throw new LlmSuggestError(503, 'No assignable categories are available for Amazon splits');
    }

    const prompt = buildAmazonSplitPrompt({
        transaction: tx,
        match: match.kind,
        orderIds: match.orderIds,
        items: billedItems,
        orders: matchedOrders,
        catalog,
    });
    const content = await completeOpenRouterJson({
        apiKey,
        baseUrl: OPENROUTER_BASE_URL,
        model: OPENROUTER_MODEL,
        system: prompt.system,
        user: prompt.user,
        timeoutMs: OPENROUTER_TIMEOUT_MS,
        schemaName: 'amazon_split',
        schema: AMAZON_SPLIT_SCHEMA as unknown as Record<string, unknown>,
        signal,
    });
    const parsed = parseAmazonSplitCompletion(content, catalog, tx.amount, billedItems.length);
    const overlay: AmazonSplitOverlayDto = {
        transactionId: tx.id,
        dataStatus: 'ready',
        match: match.kind,
        payment: toPaymentDto(match.payment),
        orders: toOrderDtos(matchedOrders, tx.amount, match.payment, signedItems),
        orderIds: [...match.orderIds],
        items: attachItemCategories(billedItems, parsed.rawLines),
        lines: parsed.lines,
        collapsed: collapsedSplitCategory(parsed.lines) !== null,
        rationale: parsed.rationale,
        notes: listVsChargedNote(signedItems, tx.amount),
    };
    await upsertAmazonSplitOverlay(tx.id, scored.fingerprint, overlay);
    return overlay;
}

async function loadOrdersForIds(orderIds: readonly string[]): Promise<AmazonOrderRecord[]> {
    const orders: AmazonOrderRecord[] = [];
    for (const orderId of orderIds) {
        const order = await getOrderWithItems(orderId);
        if (order) {
            orders.push(order);
        }
    }
    return orders;
}

function flattenItems(orders: readonly AmazonOrderRecord[]): AmazonMatchedItem[] {
    const items: AmazonMatchedItem[] = [];
    for (const order of orders) {
        for (const item of order.items) {
            items.push({ ...item, orderId: order.orderId });
        }
    }
    return items;
}

function toPaymentDto(payment: AmazonPaymentRecord | null): AmazonMatchedPaymentDto | null {
    if (!payment) {
        return null;
    }
    return {
        id: payment.id,
        paymentDate: payment.paymentDate,
        amount: payment.amountMilliunits,
        currency: payment.currency,
        cardLast4: payment.cardLast4,
        vendor: payment.vendor,
        isRefund: payment.isRefund,
    };
}

function ordersOrIds(
    orders: readonly AmazonOrderRecord[],
    orderIds: readonly string[],
    bankAmount: number,
    payment: AmazonPaymentRecord | null,
    listItems: readonly AmazonMatchedItem[],
): AmazonMatchedOrderDto[] {
    const dtos = toOrderDtos(orders, bankAmount, payment, listItems);
    if (dtos.length > 0) {
        return dtos;
    }
    return orderIds.map((orderId) => ({
        orderId,
        orderDate: null,
        total: null,
        tax: null,
        shipping: null,
        promotion: null,
    }));
}

function missingAmazonDetailsNote(
    expectedOrderIds: readonly string[],
    orders: readonly AmazonOrderRecord[],
    itemCount: number,
): string {
    const storedIds = new Set(orders.map((order) => order.orderId));
    const missing = expectedOrderIds.filter((orderId) => !storedIds.has(orderId));
    if (missing.length > 0) {
        return `Amazon order details are missing for ${missing.join(', ')}. Sync Amazon, then retry.`;
    }
    if (itemCount === 0) {
        return 'Amazon stored this payment but no line items. Sync Amazon to re-scrape the order, then retry.';
    }
    return 'Amazon only stored part of this order. Sync Amazon to re-scrape every line item, then retry.';
}

function toOrderDtos(
    orders: readonly AmazonOrderRecord[],
    bankAmount: number,
    payment: AmazonPaymentRecord | null,
    listItems: readonly AmazonMatchedItem[],
): AmazonMatchedOrderDto[] {
    const charged = payment ? Math.abs(payment.amountMilliunits) : null;
    const listSum = listItems.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    return orders.map((order) => {
        const scrapedTotal =
            order.totalMilliunits == null || order.totalMilliunits === 0 ? null : order.totalMilliunits;
        const total = scrapedTotal ?? (orders.length === 1 && charged != null ? charged : null);
        let promotion = order.promotionMilliunits;
        if ((promotion == null || promotion === 0) && orders.length === 1 && charged != null && listSum > charged) {
            promotion = listSum - charged;
        }
        return {
            orderId: order.orderId,
            orderDate: order.orderDate,
            total: total == null ? null : alignAmountToBank(total, bankAmount),
            tax: order.taxMilliunits == null ? null : alignAmountToBank(order.taxMilliunits, bankAmount),
            shipping: order.shippingMilliunits == null ? null : alignAmountToBank(order.shippingMilliunits, bankAmount),
            promotion: promotion == null || promotion === 0 ? null : alignAmountToBank(promotion, bankAmount),
        };
    });
}

function listVsChargedNote(items: readonly AmazonMatchedItem[], bankAmount: number): string | null {
    const list = items.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    const charged = Math.abs(bankAmount);
    if (list === 0 || list === charged || list < charged) {
        return null;
    }
    return `List prices sum to ${formatUsd(list)}; this charge is ${formatUsd(charged)} after discounts.`;
}

function formatUsd(milliunits: number): string {
    return `$${(milliunits / 1000).toFixed(2)}`;
}
