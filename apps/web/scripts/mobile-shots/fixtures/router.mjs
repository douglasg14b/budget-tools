// @ts-check
/**
 * Maps an intercepted `/api/**` request to a synthetic fixture response.
 *
 * `resolveFixture` returns `null` when no fixture matches; the harness then aborts the request
 * so it can never fall through to the Vite proxy (which forwards to the real API on :4020).
 * Every fixture answers 2xx: React Query retries failures three times, which would stall the
 * page on "Loading…" and spam the log.
 */

import {
    ACCOUNTS,
    AMAZON_STATUS,
    CATEGORY_GROUPS,
    categoryById,
    instantMinutesAgo,
    isoDaysAgo,
    ME,
    OUTBOUND_SYNC,
    PERIODIC_SERIES,
    predictedItems,
    queueItems,
    RECEIPTS,
    receiptSvg,
    spendChart,
    TRAVEL_WINDOWS,
    YNAB_FLAGS,
} from './data.mjs';

/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationQueueDto} CategorizationQueueDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationQueueItemDto} CategorizationQueueItemDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').LlmSuggestOverlayDto} LlmSuggestOverlayDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').AmazonSplitOverlayDto} AmazonSplitOverlayDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').ReceiptMatchDto} ReceiptMatchDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').ApprovalTier} ApprovalTier */

/**
 * @typedef {{ status: number; contentType: string; body: string }} FixtureResponse
 * @typedef {{ method: string; path: string; query: URLSearchParams; body: unknown; mode: 'practice' | 'live' }} FixtureRequest
 */

/** @param {unknown} data @param {number} [status] @returns {FixtureResponse} */
function json(data, status = 200) {
    return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

/** @returns {FixtureResponse} */
function noContent() {
    return { status: 204, contentType: 'text/plain', body: '' };
}

/** @param {unknown} body @returns {Record<string, unknown>} */
function record(body) {
    return body && typeof body === 'object' && !Array.isArray(body)
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
}

// ---------------------------------------------------------------------------------------------
// Queue

/** @param {CategorizationQueueItemDto} item @param {string} q */
function matchesQuery(item, q) {
    const t = item.transaction;
    const haystack = [
        t.payeeName,
        t.importPayeeName,
        t.importPayeeNameOriginal,
        t.memo,
        t.categoryName,
        t.accountName,
        t.date,
        (t.amount / 1000).toFixed(2),
        item.proposal?.suggestedCategory,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(q.toLowerCase());
}

/** @param {URLSearchParams} query @returns {CategorizationQueueDto} */
function queue(query) {
    const all = queueItems();
    // Window queries (Classify) list pending rows whether or not they are scored; the review
    // list (no cursor) is the scored working set only.
    const isWindow = query.has('around') || query.has('olderThan') || query.has('newerThan');
    let items = isWindow ? all : all.filter((item) => item.proposal);
    const q = query.get('q')?.trim();
    if (q) {
        items = items.filter((item) => matchesQuery(item, q));
    }
    const accountId = query.get('accountId');
    if (accountId) {
        items = items.filter((item) => item.transaction.accountId === accountId);
    }
    const tiers = query.get('tier')?.split(',').filter(Boolean);
    if (tiers?.length) {
        items = items.filter((item) => item.proposal && tiers.includes(item.proposal.tier));
    }
    // One window holds the whole fixture set, so paging past either end is empty.
    if (query.has('olderThan') || query.has('newerThan')) {
        items = [];
    }

    /** @param {ApprovalTier} tier */
    const count = (tier) => all.filter((item) => item.proposal?.tier === tier).length;
    const scored = all.filter((item) => item.proposal).length;
    return {
        items,
        hasMore: false,
        hasMoreOlder: false,
        hasMoreNewer: false,
        scoredCount: scored,
        pendingCount: all.length,
        llm: true,
        generatedAt: instantMinutesAgo(3),
        summary: {
            total: scored,
            autoApply: count('AutoApply'),
            suggested: count('Suggested'),
            review: count('Review'),
            blocked: count('Blocked'),
        },
    };
}

/** @param {string} transactionId @returns {LlmSuggestOverlayDto} */
function llmSuggest(transactionId) {
    const item = queueItems().find((row) => row.transaction.id === transactionId);
    const top = item?.proposal?.options[0];
    const fallback = categoryById('cat-dining');
    const category = top?.categoryId ? categoryById(top.categoryId) : fallback;
    const confidence = 0.83;
    return {
        transactionId,
        model: 'fixture/llm-model',
        suggestedCategory: category.name,
        suggestedCategoryGroup: category.groupName,
        suggestedCategoryId: category.id,
        confidence,
        notes: `Looks like a typical ${category.name.toLowerCase()} charge for this merchant.`,
        payeeSuggestion: null,
        options: [
            {
                rank: 1,
                category: category.name,
                categoryGroup: category.groupName,
                categoryId: category.id,
                confidence,
                supportingMethods: [{ method: 'LlmCategorization', category: category.name, confidence }],
            },
        ],
    };
}

/** @param {string} transactionId @returns {AmazonSplitOverlayDto} */
function amazonSuggest(transactionId) {
    const item = queueItems().find((row) => row.transaction.id === transactionId);
    const amount = item?.transaction.amount ?? -63980;
    const household = categoryById('cat-household');
    const groceries = categoryById('cat-groceries');
    const first = -41990;
    const second = amount - first;
    return {
        transactionId,
        dataStatus: 'ready',
        match: 'payment',
        payment: {
            id: 'amzn-pay-fixture-1',
            paymentDate: item?.transaction.date ?? isoDaysAgo(1),
            // Milliunits, signed like the bank transaction (the UI formats these with formatYnabAmount).
            amount,
            currency: 'USD',
            cardLast4: '4242',
            vendor: 'Amazon.com',
            isRefund: false,
        },
        orders: [
            {
                orderId: '112-0000000-1234567',
                orderDate: isoDaysAgo(2),
                total: amount,
                tax: -4120,
                shipping: 0,
                promotion: null,
            },
        ],
        orderIds: ['112-0000000-1234567'],
        items: [
            {
                orderId: '112-0000000-1234567',
                title: 'Bounty Select-A-Size Paper Towels, 12 Double Rolls, White, Extra Absorbent Kitchen Roll',
                asin: 'B000FIXTUR1',
                quantity: 1,
                amount: first,
                categoryId: household.id,
                categoryName: household.name,
                categoryGroup: household.groupName,
            },
            {
                orderId: '112-0000000-1234567',
                title: 'Organic Rolled Oats, 5 lb Bag',
                asin: 'B000FIXTUR2',
                quantity: 2,
                amount: second,
                categoryId: groceries.id,
                categoryName: groceries.name,
                categoryGroup: groceries.groupName,
            },
        ],
        lines: [
            {
                amount: first,
                categoryId: household.id,
                categoryName: household.name,
                categoryGroup: household.groupName,
                memo: 'Paper towels',
            },
            {
                amount: second,
                categoryId: groceries.id,
                categoryName: groceries.name,
                categoryGroup: groceries.groupName,
                memo: 'Rolled oats x2',
            },
        ],
        collapsed: false,
        rationale: 'Two items on one order; split by item category.',
        notes: null,
    };
}

// ---------------------------------------------------------------------------------------------
// Receipts

/** @param {string | null} transactionId @returns {ReceiptMatchDto} */
function receiptLookup(transactionId) {
    const bound = RECEIPTS.find((row) => transactionId && row.transactionId === transactionId);
    return {
        splitDraft: null,
        bindCandidates: [],
        closeMatches: [],
        exactTransactionId: bound ? bound.transactionId : null,
        exactReceiptId: null,
        autoBind: false,
        amazonSkipped: false,
    };
}

/** @param {string} receiptId @returns {ReceiptMatchDto} */
function receiptLookupByReceipt(receiptId) {
    const receipt = RECEIPTS.find((row) => row.id === receiptId);
    const candidates = queueItems()
        .filter((item) => item.transaction.amount < 0)
        .slice(0, 3)
        .map((item) => ({
            id: item.transaction.id,
            date: item.transaction.date,
            amount: item.transaction.amount,
            payeeName: item.transaction.payeeName,
            importPayeeName: item.transaction.importPayeeName,
            importPayeeNameOriginal: item.transaction.importPayeeNameOriginal,
            accountName: item.transaction.accountName,
            categoryName: null,
            memo: item.transaction.memo,
        }));
    return {
        splitDraft: null,
        bindCandidates: receipt?.transactionId ? [] : candidates,
        closeMatches: [],
        exactTransactionId: receipt?.transactionId ?? null,
        exactReceiptId: receipt?.transactionId ? receipt.id : null,
        autoBind: false,
        amazonSkipped: false,
    };
}

// ---------------------------------------------------------------------------------------------
// Routing table

/**
 * @type {Array<{ method: string; pattern: RegExp; handle: (req: FixtureRequest, match: RegExpMatchArray) => FixtureResponse }>}
 */
const ROUTES = [
    // Auth
    { method: 'GET', pattern: /^\/auth\/me$/, handle: () => json(ME) },
    {
        method: 'POST',
        pattern: /^\/auth\/login$/,
        handle: () => json({ user: ME, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
    },
    { method: 'POST', pattern: /^\/auth\/logout$/, handle: () => json({ ok: true }) },
    { method: 'PATCH', pattern: /^\/auth\/password$/, handle: () => json({ ok: true, revokedSessions: 0 }) },

    // Shell
    { method: 'GET', pattern: /^\/operating-mode$/, handle: (req) => json({ mode: req.mode }) },
    {
        method: 'PATCH',
        pattern: /^\/operating-mode$/,
        handle: (req) => json({ mode: record(req.body).mode === 'live' ? 'live' : 'practice' }),
    },
    { method: 'GET', pattern: /^\/health$/, handle: () => json({ ok: true }) },
    { method: 'GET', pattern: /^\/categorization\/outbound-sync$/, handle: () => json(OUTBOUND_SYNC) },
    {
        method: 'POST',
        pattern: /^\/categorization\/outbound-sync\/flush$/,
        handle: () => json({ attempted: 0, synced: 0, failed: 0, skipped: true, skipReason: 'fixture' }),
    },

    // Categorization
    { method: 'GET', pattern: /^\/categorization\/queue$/, handle: (req) => json(queue(req.query)) },
    {
        method: 'POST',
        pattern: /^\/categorization\/predict$/,
        handle: (req) => {
            const ids = record(req.body).transactionIds;
            return json({
                items: predictedItems(Array.isArray(ids) ? ids.map(String) : []),
                generatedAt: new Date().toISOString(),
            });
        },
    },
    {
        method: 'POST',
        pattern: /^\/categorization\/llm-suggest$/,
        handle: (req) => json(llmSuggest(String(record(req.body).transactionId ?? ''))),
    },
    {
        method: 'POST',
        pattern: /^\/categorization\/amazon-suggest$/,
        handle: (req) => json(amazonSuggest(String(record(req.body).transactionId ?? ''))),
    },
    {
        method: 'POST',
        pattern: /^\/categorization\/decisions$/,
        handle: (req) => {
            const decisions = record(req.body).decisions;
            const accepted = Array.isArray(decisions) ? decisions.length : 0;
            return json({ accepted, pendingCount: OUTBOUND_SYNC.pendingCount + accepted });
        },
    },
    { method: 'DELETE', pattern: /^\/categorization\/decisions\/[^/]+$/, handle: () => noContent() },
    { method: 'GET', pattern: /^\/categorization\/ynab-flags$/, handle: () => json(YNAB_FLAGS) },
    { method: 'GET', pattern: /^\/categories$/, handle: () => json({ groups: CATEGORY_GROUPS }) },

    // Amazon
    { method: 'GET', pattern: /^\/amazon-orders\/status$/, handle: () => json(AMAZON_STATUS) },
    {
        method: 'POST',
        pattern: /^\/amazon-orders\/sync$/,
        handle: (req) => {
            const body = record(req.body);
            return json({
                region: 'us',
                from: String(body.from ?? isoDaysAgo(30)),
                to: String(body.to ?? isoDaysAgo(0)),
                payments: 0,
                orders: 0,
                items: 0,
                fetchedOrderIds: [],
                scrapedPaymentGaps: [],
                coveredRanges: AMAZON_STATUS.coveredRanges,
            });
        },
    },

    // Receipts (more specific paths first)
    { method: 'GET', pattern: /^\/receipts$/, handle: () => json({ receipts: RECEIPTS }) },
    {
        method: 'GET',
        pattern: /^\/receipts\/lookup-by-transaction$/,
        handle: (req) => json(receiptLookup(req.query.get('transactionId'))),
    },
    {
        method: 'GET',
        pattern: /^\/receipts\/lookup-by-receipt$/,
        handle: (req) => json(receiptLookupByReceipt(req.query.get('receiptId') ?? '')),
    },
    { method: 'POST', pattern: /^\/receipts\/match-preview$/, handle: () => json(receiptLookup(null)) },
    {
        method: 'POST',
        pattern: /^\/receipts\/extract-preview$/,
        handle: () =>
            json({
                extractStatus: 'gated',
                vendor: "Trader Joe's",
                purchaseDate: isoDaysAgo(0),
                printedMilliunits: 84370,
                totalsDisagree: false,
                extractJson: RECEIPTS[0].extractJson,
                rawText: null,
                droppedAsAmazon: false,
            }),
    },
    {
        method: 'GET',
        pattern: /^\/receipts\/([^/]+)\/image$/,
        handle: (_req, match) => {
            const receipt = RECEIPTS.find((row) => row.id === match[1]);
            return { status: 200, contentType: 'image/svg+xml', body: receiptSvg(receipt?.vendor ?? 'RECEIPT') };
        },
    },
    {
        method: 'POST',
        pattern: /^\/receipts\/([^/]+)\/(auto-bind|retry-extract|bind)$/,
        handle: (_req, match) => json(RECEIPTS.find((row) => row.id === match[1]) ?? RECEIPTS[1]),
    },
    {
        method: 'DELETE',
        pattern: /^\/receipts\/([^/]+)\/bind$/,
        handle: (_req, match) =>
            json({
                ...(RECEIPTS.find((row) => row.id === match[1]) ?? RECEIPTS[1]),
                transactionId: null,
                bindSource: null,
                boundAt: null,
            }),
    },
    {
        method: 'GET',
        pattern: /^\/receipts\/([^/]+)$/,
        handle: (_req, match) => json(RECEIPTS.find((row) => row.id === match[1]) ?? RECEIPTS[1]),
    },
    {
        method: 'PATCH',
        pattern: /^\/receipts\/([^/]+)$/,
        handle: (_req, match) => json(RECEIPTS.find((row) => row.id === match[1]) ?? RECEIPTS[1]),
    },
    { method: 'DELETE', pattern: /^\/receipts\/([^/]+)$/, handle: () => noContent() },
    { method: 'POST', pattern: /^\/receipts$/, handle: () => json(RECEIPTS[1], 201) },

    // Repeating, trips, accounts, spending
    { method: 'GET', pattern: /^\/periodic-series$/, handle: () => json({ series: PERIODIC_SERIES }) },
    { method: 'GET', pattern: /^\/travel-windows$/, handle: () => json({ windows: TRAVEL_WINDOWS }) },
    {
        method: 'POST',
        pattern: /^\/travel-windows$/,
        handle: (req) => json({ ...record(req.body), id: 'trip-new' }, 201),
    },
    {
        method: 'PUT',
        pattern: /^\/travel-windows\/([^/]+)$/,
        handle: (req, match) => json({ ...record(req.body), id: match[1] }),
    },
    { method: 'DELETE', pattern: /^\/travel-windows\/([^/]+)$/, handle: () => noContent() },
    { method: 'GET', pattern: /^\/travel-bias$/, handle: () => json({ enabled: true }) },
    {
        method: 'PATCH',
        pattern: /^\/travel-bias$/,
        handle: (req) => json({ enabled: record(req.body).enabled !== false }),
    },
    { method: 'GET', pattern: /^\/accounts$/, handle: () => json({ accounts: ACCOUNTS }) },
    {
        method: 'GET',
        pattern: /^\/spend-chart$/,
        handle: (req) =>
            json(spendChart(req.query.get('start') ?? isoDaysAgo(89), req.query.get('end') ?? isoDaysAgo(0))),
    },
    {
        method: 'PUT',
        pattern: /^\/spend-chart\/smoothing\/([^/]+)$/,
        handle: (req, match) => json({ categoryId: match[1], windowDays: Number(record(req.body).windowDays ?? 1) }),
    },
];

/**
 * @param {FixtureRequest} req  `path` is relative to `/api` (e.g. `/categorization/queue`).
 * @returns {FixtureResponse | null}
 */
export function resolveFixture(req) {
    for (const route of ROUTES) {
        if (route.method !== req.method) {
            continue;
        }
        const match = req.path.match(route.pattern);
        if (match) {
            return route.handle(req, match);
        }
    }
    return null;
}
