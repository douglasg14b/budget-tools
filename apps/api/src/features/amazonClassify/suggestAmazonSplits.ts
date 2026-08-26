import { getOpenRouterApiKey, OPENROUTER_BASE_URL, OPENROUTER_MODEL } from '../../environment';
import type { AmazonOrderRecord, AmazonPaymentRecord } from '../amazonOrders/data/amazonOrdersRepo';
import { getAmazonSyncState, getOrderWithItems, listPaymentsInDateWindow } from '../amazonOrders/data/amazonOrdersRepo';
import { uncoveredIsoDateRanges } from '../amazonOrders/isoDate';
import { listCategories } from '../categories/listCategories';
import { getScoredQueueItem } from '../categorization/llm/getScoredQueueItem';
import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import { assignableCategories } from '../categorization/llm/nearbyCategories';
import { completeOpenRouterJson } from '../categorization/llm/openRouterClient';
import { collapsedSplitCategory } from '../splits/splitLines';
import { alignAmountToBank } from './alignAmountToBank';
import type { AmazonMatchedOrderDto, AmazonMatchedPaymentDto, AmazonSplitOverlayDto } from './amazonClassifyDtos';
import { amazonItemsLookIncomplete } from './amazonOrderLooksIncomplete';
import type { AmazonMatchedItem } from './attachItemCategories';
import { attachItemCategories } from './attachItemCategories';
import { buildAmazonSplitPrompt } from './buildAmazonSplitPrompt';
import { getAmazonSplitOverlay, upsertAmazonSplitOverlay } from './data/amazonSplitOverlayRepo';
import { isAmazonTransaction } from './isAmazonTransaction';
import { amazonPaymentDateWindow, matchAmazonPayment } from './matchAmazonPayment';
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
    const gaps = uncoveredIsoDateRanges(sync.coveredRanges, {
        start: window.earliestDate,
        end: window.latestDate,
    });
    if (gaps.length > 0) {
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
            notes: `Amazon order data is not synced for ${window.earliestDate} to ${window.latestDate}. Sync Amazon, then retry.`,
        };
    }

    const payments = await listPaymentsInDateWindow({
        earliestDate: window.earliestDate,
        latestDate: window.latestDate,
    });
    const absTarget = Math.abs(tx.amount);
    const windowPayments = payments.filter((payment) => Math.abs(payment.amountMilliunits) === absTarget);

    const orderIds = [...new Set(windowPayments.flatMap((payment) => [...payment.orderIds]))];
    const orders: AmazonOrderRecord[] = [];
    for (const orderId of orderIds) {
        const order = await getOrderWithItems(orderId);
        if (order) {
            orders.push(order);
        }
    }
    const ordersById = new Map(orders.map((order) => [order.orderId, order]));
    const match = matchAmazonPayment({
        bankAmountMilliunits: tx.amount,
        payments: windowPayments,
        ordersById,
    });

    const matchedOrders = match.orderIds
        .map((orderId) => ordersById.get(orderId))
        .filter((order): order is AmazonOrderRecord => Boolean(order));
    const items = flattenItems(matchedOrders);
    const signedItems = items.map((item) => ({
        ...item,
        itemTotalMilliunits: alignAmountToBank(item.itemTotalMilliunits, tx.amount),
    }));

    if (match.kind === 'unmatched') {
        return {
            transactionId: tx.id,
            dataStatus: 'ready',
            match: 'unmatched',
            payment: toPaymentDto(match.payment),
            orders: toOrderDtos(matchedOrders, tx.amount),
            orderIds: [...match.orderIds],
            items: attachItemCategories(signedItems, []),
            lines: [],
            collapsed: false,
            rationale: null,
            notes: 'No unique Amazon payment matched this bank charge. Split it by hand if you want.',
        };
    }

    if (amazonItemsLookIncomplete(items, matchedOrders)) {
        return {
            transactionId: tx.id,
            dataStatus: 'not-synced',
            match: match.kind,
            payment: toPaymentDto(match.payment),
            orders: toOrderDtos(matchedOrders, tx.amount),
            orderIds: [...match.orderIds],
            items: attachItemCategories(signedItems, []),
            lines: [],
            collapsed: false,
            rationale: null,
            notes: 'Amazon only stored part of this order. Sync Amazon to re-scrape every line item, then retry.',
        };
    }

    const stored = await getAmazonSplitOverlay(tx.id, scored.fingerprint);
    if (stored) {
        return stored;
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
        items: signedItems,
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
    const parsed = parseAmazonSplitCompletion(content, catalog, tx.amount, signedItems.length);
    const overlay: AmazonSplitOverlayDto = {
        transactionId: tx.id,
        dataStatus: 'ready',
        match: match.kind,
        payment: toPaymentDto(match.payment),
        orders: toOrderDtos(matchedOrders, tx.amount),
        orderIds: [...match.orderIds],
        items: attachItemCategories(signedItems, parsed.rawLines),
        lines: parsed.lines,
        collapsed: collapsedSplitCategory(parsed.lines) !== null,
        rationale: parsed.rationale,
        notes: null,
    };
    await upsertAmazonSplitOverlay(tx.id, scored.fingerprint, overlay);
    return overlay;
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

function toOrderDtos(orders: readonly AmazonOrderRecord[], bankAmount: number): AmazonMatchedOrderDto[] {
    return orders.map((order) => ({
        orderId: order.orderId,
        orderDate: order.orderDate,
        total: order.totalMilliunits == null ? null : alignAmountToBank(order.totalMilliunits, bankAmount),
        tax: order.taxMilliunits == null ? null : alignAmountToBank(order.taxMilliunits, bankAmount),
        shipping: order.shippingMilliunits == null ? null : alignAmountToBank(order.shippingMilliunits, bankAmount),
        promotion: order.promotionMilliunits == null ? null : alignAmountToBank(order.promotionMilliunits, bankAmount),
    }));
}
