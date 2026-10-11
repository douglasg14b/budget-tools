// @ts-check
/**
 * Synthetic fixture data for the mobile screenshot harness.
 *
 * Every payee, amount, account and id here is fake. Shapes mirror the generated DTOs in
 * packages/web-sdk/src/gen/types.gen.ts; the JSDoc types below let `tsc --checkJs` verify that.
 * Amounts are YNAB milliunits (-45670 = -$45.67). Dates are relative to "today" so the queue,
 * repeating series and trips always look current.
 */

/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationQueueItemDto} CategorizationQueueItemDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationProposalDto} CategorizationProposalDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').TransactionDetailDto} TransactionDetailDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategoryGroupDto} CategoryGroupDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationFlagsDto} CategorizationFlagsDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategoryOptionDto} CategoryOptionDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').MethodSignalDto} MethodSignalDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').ApprovalTier} ApprovalTier */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationMethod} CategorizationMethod */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').CategorizationRouteReason} CategorizationRouteReason */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').ProposalGapReason} ProposalGapReason */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').PayeeSuggestionDto} PayeeSuggestionDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').PeriodicMatchDto} PeriodicMatchDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').TravelWindowHitDto} TravelWindowHitDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').YnabFlagColor} YnabFlagColor */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').YnabFlagsDto} YnabFlagsDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').ReceiptDto} ReceiptDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').PeriodicSeriesDto} PeriodicSeriesDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').TravelWindowDto} TravelWindowDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').AccountDto} AccountDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').AmazonOrdersStatusDto} AmazonOrdersStatusDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').OutboundSyncStatusDto} OutboundSyncStatusDto */
/** @typedef {import('../../../../../packages/web-sdk/src/gen/types.gen').AuthUserDto} AuthUserDto */

// ---------------------------------------------------------------------------------------------
// Dates

/** Local `YYYY-MM-DD`, `days` before today. @param {number} days */
export function isoDaysAgo(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** ISO instant, `minutes` before now. @param {number} minutes */
export function instantMinutesAgo(minutes) {
    return new Date(Date.now() - minutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------------------------
// Auth, mode, accounts

/** @type {AuthUserDto} */
export const ME = { id: 'user-fixture-1', username: 'demo' };

/** @type {AccountDto[]} */
export const ACCOUNTS = [
    { id: 'acc-checking', name: 'Checking' },
    { id: 'acc-main-card', name: 'Main Card' },
    { id: 'acc-travel-card', name: 'Travel Rewards Visa Signature' },
    { id: 'acc-savings', name: 'Joint Savings' },
];

const accountName = (/** @type {string} */ id) => ACCOUNTS.find((account) => account.id === id)?.name ?? 'Checking';

// ---------------------------------------------------------------------------------------------
// Categories

/** @type {CategoryGroupDto[]} */
export const CATEGORY_GROUPS = [
    {
        id: 'grp-internal',
        name: 'Internal Master Category',
        hidden: false,
        categories: [
            { id: 'cat-rta', name: 'Inflow: Ready to Assign', hidden: false, note: null },
            { id: 'cat-uncategorized', name: 'Uncategorized', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-bills',
        name: 'Immediate Obligations',
        hidden: false,
        categories: [
            { id: 'cat-rent', name: 'Rent', hidden: false, note: null },
            { id: 'cat-electric', name: 'Electric & Gas', hidden: false, note: null },
            { id: 'cat-internet', name: 'Internet', hidden: false, note: null },
            { id: 'cat-phone', name: 'Phone', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-everyday',
        name: 'Everyday Spending',
        hidden: false,
        categories: [
            { id: 'cat-groceries', name: 'Groceries', hidden: false, note: 'Supermarkets and farmers markets' },
            { id: 'cat-dining', name: 'Dining Out', hidden: false, note: null },
            { id: 'cat-coffee', name: 'Coffee Shops', hidden: false, note: null },
            { id: 'cat-household', name: 'Household Supplies', hidden: false, note: null },
            { id: 'cat-pharmacy', name: 'Pharmacy', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-transport',
        name: 'Transportation',
        hidden: false,
        categories: [
            { id: 'cat-fuel', name: 'Fuel', hidden: false, note: null },
            { id: 'cat-rideshare', name: 'Rideshare', hidden: false, note: null },
            { id: 'cat-parking', name: 'Parking & Tolls', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-subscriptions',
        name: 'Subscriptions',
        hidden: false,
        categories: [
            { id: 'cat-streaming', name: 'Streaming Services', hidden: false, note: null },
            { id: 'cat-software', name: 'Software & Cloud Storage', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-home',
        name: 'Home & Garden',
        hidden: false,
        categories: [
            {
                id: 'cat-home-improvement',
                name: 'Home Improvement & Garden Maintenance Projects',
                hidden: false,
                note: null,
            },
        ],
    },
    {
        id: 'grp-travel',
        name: 'Travel',
        hidden: false,
        categories: [
            { id: 'cat-vacation-lodging', name: 'Vacation: Lodging', hidden: false, note: null },
            { id: 'cat-vacation-dining', name: 'Vacation: Dining', hidden: false, note: null },
            { id: 'cat-work-travel', name: 'Work Travel (Reimbursable)', hidden: false, note: null },
        ],
    },
    {
        id: 'grp-giving',
        name: 'Gifts & Giving',
        hidden: false,
        categories: [{ id: 'cat-gifts', name: 'Gifts', hidden: false, note: null }],
    },
    {
        id: 'grp-hidden',
        name: 'Hidden Categories',
        hidden: true,
        categories: [{ id: 'cat-old-gym', name: 'Gym (old)', hidden: true, note: null }],
    },
];

/** @param {string} id */
export function categoryById(id) {
    for (const group of CATEGORY_GROUPS) {
        const category = group.categories.find((row) => row.id === id);
        if (category) {
            return { id: category.id, name: category.name, groupName: group.name };
        }
    }
    throw new Error(`Unknown fixture category ${id}`);
}

// ---------------------------------------------------------------------------------------------
// Queue builders

/** @type {CategorizationFlagsDto} */
const NO_FLAGS = {
    isTravelWindow: false,
    isPeriodicConflict: false,
    isPeriodic: false,
    requiresManualReview: false,
    isExcluded: false,
    isNovelImport: false,
    isAmbiguous: false,
};

/**
 * @param {{
 *   id: string; daysAgo: number; amount: number; accountId: string;
 *   payeeName: string | null; importPayeeName?: string | null; importPayeeNameOriginal?: string | null;
 *   memo?: string | null; flagColor?: YnabFlagColor | null; flagName?: string | null;
 *   cleared?: TransactionDetailDto['cleared'];
 * }} input
 * @returns {TransactionDetailDto}
 */
function tx(input) {
    return {
        id: input.id,
        date: isoDaysAgo(input.daysAgo),
        amount: input.amount,
        memo: input.memo ?? null,
        cleared: input.cleared ?? 'cleared',
        approved: false,
        flagColor: input.flagColor ?? null,
        flagName: input.flagName ?? null,
        accountId: input.accountId,
        accountName: accountName(input.accountId),
        payeeId: input.payeeName ? `payee-${input.id}` : null,
        payeeName: input.payeeName,
        categoryId: null,
        categoryName: null,
        importId: `YNAB:${input.amount}:${isoDaysAgo(input.daysAgo)}:1`,
        importPayeeName: input.importPayeeName ?? input.payeeName,
        importPayeeNameOriginal:
            input.importPayeeNameOriginal ?? (input.payeeName ? input.payeeName.toUpperCase() : null),
    };
}

/**
 * @param {string} categoryId
 * @param {number} confidence
 * @param {CategorizationMethod[]} methods
 * @param {number} rank
 * @returns {CategoryOptionDto}
 */
function option(categoryId, confidence, methods, rank) {
    const category = categoryById(categoryId);
    return {
        rank,
        category: category.name,
        categoryGroup: category.groupName,
        categoryId: category.id,
        confidence,
        supportingMethods: methods.map((method) => ({ method, category: category.name, confidence })),
    };
}

/**
 * @param {{
 *   transaction: TransactionDetailDto; tier: ApprovalTier; categoryId: string | null; confidence: number;
 *   method: CategorizationMethod; routeReason?: CategorizationRouteReason; gapReason?: ProposalGapReason;
 *   flags?: Partial<CategorizationFlagsDto>; alternatives?: Array<[string, number]>;
 *   agreeing?: CategorizationMethod[]; payeeSuggestion?: PayeeSuggestionDto | null; notes?: string | null;
 *   periodicMatch?: PeriodicMatchDto | null; travelWindow?: TravelWindowHitDto | null;
 * }} input
 * @returns {CategorizationProposalDto}
 */
function proposal(input) {
    const agreeing = input.agreeing ?? [input.method];
    const top = input.categoryId ? option(input.categoryId, input.confidence, agreeing, 1) : null;
    const alternatives = (input.alternatives ?? []).map(([categoryId, confidence], index) =>
        option(categoryId, confidence, ['CategoryModel'], index + (top ? 2 : 1)),
    );
    const options = top ? [top, ...alternatives] : alternatives;
    /** @type {MethodSignalDto[]} */
    const agreeingSignals = top
        ? agreeing.map((method) => ({ method, category: top.category, confidence: input.confidence }))
        : [];
    /** @type {MethodSignalDto[]} */
    const otherSignals = alternatives.map((row) => ({
        method: 'CategoryModel',
        category: row.category,
        confidence: row.confidence,
    }));
    const second = options[1]?.confidence ?? null;
    const third = options[2]?.confidence ?? null;
    const payee = input.transaction.payeeName ?? input.transaction.importPayeeName ?? '';
    return {
        transactionId: input.transaction.id,
        tier: input.tier,
        flags: { ...NO_FLAGS, ...input.flags },
        suggestedCategory: top?.category ?? null,
        suggestedCategoryGroup: top?.categoryGroup ?? null,
        suggestedCategoryId: top?.categoryId ?? null,
        confidence: input.confidence,
        method: input.method,
        routeReason: input.routeReason ?? 'None',
        gapReason: input.gapReason ?? 'None',
        signals: [...agreeingSignals, ...otherSignals],
        agreeingSignals,
        options,
        confidenceInterval: {
            top: input.confidence,
            second,
            third,
            spread: Math.max(0, input.confidence - (second ?? 0)),
        },
        featureText: `${payee} ${input.transaction.importPayeeNameOriginal ?? ''}`.trim().toLowerCase(),
        resolvedPayee: input.transaction.payeeName,
        payeeSuggestion: input.payeeSuggestion ?? null,
        notes: input.notes ?? null,
        periodicMatch: input.periodicMatch ?? null,
        travelWindow: input.travelWindow ?? null,
    };
}

// ---------------------------------------------------------------------------------------------
// Periodic history used by both the queue (relatedTransactions) and /periodic-series

/**
 * @param {string} prefix
 * @param {string} payeeName
 * @param {number} amount
 * @param {string} accountId
 * @param {string} categoryId
 * @param {number[]} daysAgo
 * @returns {TransactionDetailDto[]}
 */
function history(prefix, payeeName, amount, accountId, categoryId, daysAgo) {
    const category = categoryById(categoryId);
    return daysAgo.map((days, index) => ({
        ...tx({ id: `${prefix}-hist-${index + 1}`, daysAgo: days, amount, accountId, payeeName }),
        approved: true,
        cleared: /** @type {const} */ ('reconciled'),
        categoryId: category.id,
        categoryName: category.name,
    }));
}

const NETFLIX_HISTORY = history('netflix', 'Netflix', -15490, 'acc-main-card', 'cat-streaming', [33, 64, 94, 125]);
const PGE_HISTORY = history('pge', 'PG&E', -131870, 'acc-checking', 'cat-electric', [36, 66, 97]);
const SPOTIFY_HISTORY = history('spotify', 'Spotify', -11990, 'acc-main-card', 'cat-software', [30, 61, 91]);

// ---------------------------------------------------------------------------------------------
// The queue: 25 pending rows, newest first

/** @type {Array<{ transaction: TransactionDetailDto; build: (t: TransactionDetailDto) => CategorizationProposalDto | null; related?: TransactionDetailDto[]; unscored?: boolean }>} */
const QUEUE_SPECS = [
    {
        transaction: tx({
            id: 'tx-01-trader-joes',
            daysAgo: 0,
            amount: -84370,
            accountId: 'acc-main-card',
            payeeName: "Trader Joe's",
            importPayeeNameOriginal: "TRADER JOE'S #552 QPS",
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-groceries',
                confidence: 1.0,
                method: 'ImportLookup',
                agreeing: ['ImportLookup', 'PayeeIdLookup', 'CategoryModel'],
                alternatives: [['cat-household', 0.04]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-02-shell',
            daysAgo: 0,
            amount: -52100,
            accountId: 'acc-main-card',
            payeeName: 'Shell',
            importPayeeNameOriginal: 'SHELL OIL 57444219803',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-fuel',
                confidence: 1.0,
                method: 'PayeeIdLookup',
                agreeing: ['PayeeIdLookup', 'CanonicalPayeeLookup'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-03-amazon',
            daysAgo: 1,
            amount: -63980,
            accountId: 'acc-main-card',
            payeeName: 'Amazon',
            importPayeeName: 'AMAZON MKTPL*2K4LM9ZQ1',
            importPayeeNameOriginal: 'AMAZON MKTPL*2K4LM9ZQ1 Amzn.com/billWA',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-household',
                confidence: 0.72,
                method: 'PayeeModel',
                gapReason: 'SingleMethodSuggestion',
                alternatives: [
                    ['cat-groceries', 0.18],
                    ['cat-gifts', 0.06],
                ],
            }),
    },
    {
        transaction: tx({
            id: 'tx-04-netflix',
            daysAgo: 2,
            amount: -15490,
            accountId: 'acc-main-card',
            payeeName: 'Netflix',
            importPayeeNameOriginal: 'NETFLIX.COM 866-579-7172 CA',
        }),
        related: NETFLIX_HISTORY,
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-streaming',
                confidence: 1.0,
                method: 'PeriodicSeriesLookup',
                agreeing: ['PeriodicSeriesLookup', 'PayeeIdLookup'],
                flags: { isPeriodic: true },
                periodicMatch: {
                    cadence: 'Monthly',
                    cadenceFit: 0.97,
                    category: 'Streaming Services',
                    categoryVoteShare: 1,
                    lastDate: NETFLIX_HISTORY[0].date,
                    medianAmount: -15490,
                    occurrenceCount: 4,
                    relatedTransactionIds: NETFLIX_HISTORY.map((row) => row.id),
                },
            }),
    },
    {
        transaction: tx({
            id: 'tx-05-farmers-market',
            daysAgo: 2,
            amount: -37250,
            accountId: 'acc-checking',
            payeeName: 'Sq *the Original Neighborhood Farmers Market Cooperative of Greater Portland',
            importPayeeNameOriginal:
                'SQ *THE ORIGINAL NEIGHBORHOOD FARMERS MARKET COOPERATIVE OF GREATER PORTLAND gosq.com OR',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-groceries',
                confidence: 0.81,
                method: 'HierarchicalModel',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['HierarchicalModel', 'CategoryModel'],
                alternatives: [['cat-dining', 0.11]],
                payeeSuggestion: {
                    name: 'Neighborhood Farmers Market',
                    method: 'Model',
                    confidence: 0.86,
                    needsRename: true,
                },
            }),
    },
    {
        transaction: tx({
            id: 'tx-06-payroll',
            daysAgo: 3,
            amount: 3250000,
            accountId: 'acc-checking',
            payeeName: 'Acme Corp Payroll',
            importPayeeNameOriginal: 'ACME CORP PAYROLL PPD ID: 9998887776',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-rta',
                confidence: 1.0,
                method: 'ImportAmountLookup',
                agreeing: ['ImportAmountLookup', 'PayeeIdLookup'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-07-blue-bottle',
            daysAgo: 3,
            amount: -6450,
            accountId: 'acc-main-card',
            payeeName: 'Blue Bottle Coffee',
            importPayeeNameOriginal: 'BLUE BOTTLE COFFEE #12',
        }),
        unscored: true,
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-coffee',
                confidence: 0.88,
                method: 'CategoryModel',
                gapReason: 'SingleMethodSuggestion',
                alternatives: [['cat-dining', 0.09]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-08-check',
            daysAgo: 4,
            amount: -1200000,
            accountId: 'acc-checking',
            payeeName: null,
            importPayeeName: 'CHECK #1042',
            importPayeeNameOriginal: 'CHECK #1042',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Blocked',
                categoryId: null,
                confidence: 0,
                method: 'Excluded',
                routeReason: 'ExcludedCheck',
                gapReason: 'Excluded',
                flags: { isExcluded: true, requiresManualReview: true },
                notes: 'Paper checks are never auto-categorized.',
            }),
    },
    {
        transaction: tx({
            id: 'tx-09-venmo',
            daysAgo: 4,
            amount: -40000,
            accountId: 'acc-checking',
            payeeName: 'Venmo',
            importPayeeNameOriginal: 'VENMO PAYMENT 1029384756 WEB ID: 3264681992',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Review',
                categoryId: 'cat-dining',
                confidence: 0.34,
                method: 'Consensus',
                routeReason: 'AmbiguousMerchant',
                gapReason: 'AmbiguousMerchant',
                flags: { isAmbiguous: true },
                alternatives: [
                    ['cat-gifts', 0.29],
                    ['cat-groceries', 0.21],
                ],
            }),
    },
    {
        transaction: tx({
            id: 'tx-10-starbucks',
            daysAgo: 5,
            amount: -6450,
            accountId: 'acc-main-card',
            payeeName: 'Starbucks',
            importPayeeNameOriginal: 'STARBUCKS STORE 08812',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-coffee',
                confidence: 0.88,
                method: 'PayeeModel',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['PayeeModel', 'CategoryModel'],
                alternatives: [['cat-dining', 0.1]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-11-pge',
            daysAgo: 5,
            amount: -142330,
            accountId: 'acc-checking',
            payeeName: 'PG&E',
            importPayeeNameOriginal: 'PGANDE WEB ONLINE PPD ID: 1234567890',
        }),
        related: PGE_HISTORY,
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-electric',
                confidence: 1.0,
                method: 'PeriodicSeriesLookup',
                agreeing: ['PeriodicSeriesLookup', 'PayeeIdLookup', 'ImportLookup'],
                flags: { isPeriodic: true },
                periodicMatch: {
                    cadence: 'Monthly',
                    cadenceFit: 0.91,
                    category: 'Electric & Gas',
                    categoryVoteShare: 1,
                    lastDate: PGE_HISTORY[0].date,
                    medianAmount: -131870,
                    occurrenceCount: 3,
                    relatedTransactionIds: PGE_HISTORY.map((row) => row.id),
                },
            }),
    },
    {
        transaction: tx({
            id: 'tx-12-costco',
            daysAgo: 6,
            amount: -312770,
            accountId: 'acc-main-card',
            payeeName: 'Costco',
            importPayeeNameOriginal: 'COSTCO WHSE #0006 SEATTLE WA',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Review',
                categoryId: 'cat-groceries',
                confidence: 0.52,
                method: 'Consensus',
                routeReason: 'AmbiguousMerchant',
                gapReason: 'InsufficientAgreement',
                flags: { isAmbiguous: true },
                alternatives: [
                    ['cat-household', 0.31],
                    ['cat-pharmacy', 0.08],
                ],
            }),
    },
    {
        transaction: tx({
            id: 'tx-13-hilton',
            daysAgo: 7,
            amount: -389200,
            accountId: 'acc-travel-card',
            payeeName: 'Hilton Garden Inn Seattle Downtown',
            importPayeeNameOriginal: 'HILTON GARDEN INN SEATTLE DWTN SEATTLE WA',
            flagColor: 'blue',
            flagName: 'Trip',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-vacation-lodging',
                confidence: 0.77,
                method: 'TravelWindow',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['TravelWindow', 'CategoryModel'],
                flags: { isTravelWindow: true },
                alternatives: [['cat-work-travel', 0.19]],
                travelWindow: {
                    id: 'trip-seattle',
                    name: 'Seattle long weekend',
                    kind: 'vacation',
                    location: 'Seattle, WA',
                    merchantCity: 'Seattle',
                    locationMatch: 'match',
                    targetCategory: 'Vacation: Lodging',
                },
            }),
    },
    {
        transaction: tx({
            id: 'tx-14-target-refund',
            daysAgo: 7,
            amount: 24990,
            accountId: 'acc-main-card',
            payeeName: 'Target',
            importPayeeNameOriginal: 'TARGET T-2785 RETURN',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-household',
                confidence: 0.64,
                method: 'PayeeModel',
                gapReason: 'SingleMethodSuggestion',
                alternatives: [['cat-gifts', 0.21]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-15-chevron',
            daysAgo: 8,
            amount: -48000,
            accountId: 'acc-main-card',
            payeeName: 'Chevron',
            importPayeeNameOriginal: 'CHEVRON 0204517',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-fuel',
                confidence: 0.93,
                method: 'CanonicalPayeeLookup',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['CanonicalPayeeLookup', 'CategoryModel'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-16-xfinity',
            daysAgo: 9,
            amount: -89990,
            accountId: 'acc-checking',
            payeeName: 'Xfinity',
            importPayeeNameOriginal: 'COMCAST CABLE COMM 800-COMCAST',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-internet',
                confidence: 1.0,
                method: 'ImportLookup',
                agreeing: ['ImportLookup', 'PayeeIdLookup'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-17-novel',
            daysAgo: 10,
            amount: -17250,
            accountId: 'acc-checking',
            payeeName: null,
            importPayeeName: 'POS DEBIT 4471 XJ-REMOTE TERMINAL 88231',
            importPayeeNameOriginal: 'POS DEBIT 4471 XJ-REMOTE TERMINAL 88231 ST PAUL MN 0000000000000000000',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Review',
                categoryId: null,
                confidence: 0.31,
                method: 'None',
                routeReason: 'NovelImportString',
                gapReason: 'NoQualifiedSignals',
                flags: { isNovelImport: true },
                alternatives: [
                    ['cat-parking', 0.31],
                    ['cat-dining', 0.22],
                ],
                payeeSuggestion: { name: '', method: 'Unresolved', confidence: 0, needsRename: false },
            }),
    },
    {
        transaction: tx({
            id: 'tx-18-walgreens',
            daysAgo: 11,
            amount: -23110,
            accountId: 'acc-main-card',
            payeeName: 'Walgreens',
            importPayeeNameOriginal: 'WALGREENS #3381',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-pharmacy',
                confidence: 0.7,
                method: 'PayeeModel',
                gapReason: 'SingleMethodSuggestion',
                alternatives: [['cat-household', 0.22]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-19-home-depot',
            daysAgo: 12,
            amount: -456780,
            accountId: 'acc-main-card',
            payeeName: 'The Home Depot',
            importPayeeNameOriginal: 'THE HOME DEPOT #4710',
            memo: 'Deck stain, two brushes, and four bags of mulch for the backyard planters before the rain',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-home-improvement',
                confidence: 0.66,
                method: 'CategoryModel',
                gapReason: 'SingleMethodSuggestion',
                alternatives: [['cat-household', 0.27]],
            }),
    },
    {
        transaction: tx({
            id: 'tx-20-uber',
            daysAgo: 13,
            amount: -18400,
            accountId: 'acc-travel-card',
            payeeName: 'Uber',
            importPayeeNameOriginal: 'UBER *TRIP HELP.UBER.COM CA',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-rideshare',
                confidence: 0.94,
                method: 'PayeeIdLookup',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['PayeeIdLookup', 'CategoryModel'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-21-spotify',
            daysAgo: 14,
            amount: -11990,
            accountId: 'acc-main-card',
            payeeName: 'Spotify',
            importPayeeNameOriginal: 'Spotify USA 877-778-1161 NY',
        }),
        related: SPOTIFY_HISTORY,
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Review',
                categoryId: 'cat-streaming',
                confidence: 0.58,
                method: 'Consensus',
                gapReason: 'PeriodicConflict',
                flags: { isPeriodic: true, isPeriodicConflict: true },
                alternatives: [['cat-software', 0.4]],
                periodicMatch: {
                    cadence: 'Monthly',
                    cadenceFit: 0.95,
                    category: 'Software & Cloud Storage',
                    categoryVoteShare: 0.67,
                    lastDate: SPOTIFY_HISTORY[0].date,
                    medianAmount: -11990,
                    occurrenceCount: 3,
                    relatedTransactionIds: SPOTIFY_HISTORY.map((row) => row.id),
                },
            }),
    },
    {
        transaction: tx({
            id: 'tx-22-whole-foods',
            daysAgo: 15,
            amount: -67420,
            accountId: 'acc-main-card',
            payeeName: 'Whole Foods Market',
            importPayeeNameOriginal: 'WHOLEFDS MKT 10234',
            flagColor: 'red',
            flagName: 'Check this',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-groceries',
                confidence: 0.9,
                method: 'CanonicalPayeeLookup',
                gapReason: 'TwoMethodSuggestion',
                agreeing: ['CanonicalPayeeLookup', 'CategoryModel'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-23-chipotle',
            daysAgo: 16,
            amount: -14850,
            accountId: 'acc-main-card',
            payeeName: 'Chipotle',
            importPayeeNameOriginal: 'CHIPOTLE 2291',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'AutoApply',
                categoryId: 'cat-dining',
                confidence: 1.0,
                method: 'PayeeIdLookup',
                agreeing: ['PayeeIdLookup', 'CategoryModel'],
            }),
    },
    {
        transaction: tx({
            id: 'tx-24-interest',
            daysAgo: 18,
            amount: 1230,
            accountId: 'acc-savings',
            payeeName: 'Interest Paid',
            importPayeeNameOriginal: 'INTEREST PAYMENT',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Suggested',
                categoryId: 'cat-rta',
                confidence: 0.95,
                method: 'PayeeIdLookup',
                gapReason: 'SingleMethodSuggestion',
            }),
    },
    {
        transaction: tx({
            id: 'tx-25-zelle',
            daysAgo: 20,
            amount: -250000,
            accountId: 'acc-checking',
            payeeName: 'Zelle to J. Smith',
            importPayeeNameOriginal: 'ZELLE PAYMENT TO J SMITH JPM99AB3CDEF',
        }),
        build: (t) =>
            proposal({
                transaction: t,
                tier: 'Blocked',
                categoryId: null,
                confidence: 0,
                method: 'ManualReview',
                routeReason: 'ExcludedPayee',
                gapReason: 'Excluded',
                flags: { isExcluded: true, requiresManualReview: true },
                notes: 'Person-to-person payments always need a human.',
            }),
    },
];

/**
 * @param {(typeof QUEUE_SPECS)[number]} spec
 * @param {boolean} scored  Include proposals even for rows the queue normally returns unscored.
 */
function buildItem(spec, scored) {
    /** @type {CategorizationQueueItemDto} */
    const item = {
        transaction: spec.transaction,
        proposal: spec.unscored && !scored ? null : spec.build(spec.transaction),
        relatedTransactions: spec.related ?? [],
    };
    return item;
}

/** Queue rows as `GET /categorization/queue` returns them (one row unscored, to exercise predict). */
export function queueItems() {
    return QUEUE_SPECS.map((spec) => buildItem(spec, false));
}

/** Fully scored rows for `POST /categorization/predict`. */
export function predictedItems(/** @type {readonly string[]} */ ids) {
    return QUEUE_SPECS.filter((spec) => ids.includes(spec.transaction.id)).map((spec) => buildItem(spec, true));
}

// ---------------------------------------------------------------------------------------------
// Flags, sync, amazon status

/** @type {YnabFlagsDto} */
export const YNAB_FLAGS = {
    flags: [
        { color: 'red', name: 'Check this' },
        { color: 'orange', name: 'Reimbursable' },
        { color: 'yellow', name: null },
        { color: 'green', name: 'Split with roommate' },
        { color: 'blue', name: 'Trip' },
        { color: 'purple', name: null },
    ],
};

/** @type {OutboundSyncStatusDto} */
export const OUTBOUND_SYNC = {
    pendingCount: 2,
    syncingCount: 0,
    failedCount: 0,
    syncedUnconfirmedCount: 1,
    oldestPendingAt: instantMinutesAgo(4),
    lastError: null,
};

/** @type {AmazonOrdersStatusDto} */
export const AMAZON_STATUS = {
    region: 'us',
    mcpConfigured: true,
    lastAuthCheck: instantMinutesAgo(90),
    lastAuthenticated: true,
    coveredRanges: [{ start: isoDaysAgo(60), end: isoDaysAgo(0) }],
    payments: 42,
    orders: 37,
    items: 81,
};

// ---------------------------------------------------------------------------------------------
// Receipts (only fetched in live mode). Never 'pending': that turns on 2s polling.

/** @param {{ vendor: string; lines: Array<[string, number]>; tax: number; tip?: number }} input */
function extractJson(input) {
    return JSON.stringify({
        gated: true,
        repaired: false,
        headerPrintedMilliunits: null,
        ocrPrintedMilliunits: null,
        taxMilliunits: input.tax,
        discountMilliunits: 0,
        tipMilliunits: input.tip ?? 0,
        lines: input.lines.map(([name, amountMilliunits]) => ({ name, amountMilliunits, quantity: 1 })),
        error: null,
        verifyFlags: [],
    });
}

/** @type {ReceiptDto[]} */
export const RECEIPTS = [
    {
        id: 'rcpt-01-trader-joes',
        createdAt: instantMinutesAgo(60 * 5),
        vendor: "Trader Joe's",
        purchaseDate: isoDaysAgo(0),
        printedMilliunits: 84370,
        extractStatus: 'gated',
        extractJson: extractJson({
            vendor: "Trader Joe's",
            lines: [
                ['Organic Bananas', 1990],
                ['Mandarin Orange Chicken', 5490],
                ['Everything But The Bagel Seasoning', 2990],
                ['Sparkling Water 12pk', 4990],
                ['Oat Milk', 3490],
                ['Assorted Groceries', 61670],
            ],
            tax: 3750,
        }),
        rawText: "TRADER JOE'S #552\nORGANIC BANANAS 1.99\n...",
        extractCostUsd: 0.0042,
        transactionId: 'tx-01-trader-joes',
        contentHash: 'sha256-fixture-01',
        totalsDisagree: false,
        frameCount: 2,
        hasProcessed: true,
        bindSource: 'auto',
        boundAt: instantMinutesAgo(60 * 4),
        bindJevScore: 0.97,
        bindCheckedAt: instantMinutesAgo(60 * 4),
        bindCheckOutcome: 'bound',
    },
    {
        id: 'rcpt-02-cafe',
        createdAt: instantMinutesAgo(60 * 26),
        vendor: 'Little Owl Cafe & Bakery on Southeast Hawthorne Boulevard',
        purchaseDate: isoDaysAgo(1),
        printedMilliunits: 28640,
        extractStatus: 'ungated',
        extractJson: extractJson({
            vendor: 'Little Owl Cafe',
            lines: [
                ['Breakfast Burrito', 13500],
                ['Cortado', 4750],
                ['Almond Croissant', 5250],
            ],
            tax: 1890,
            tip: 3250,
        }),
        rawText: null,
        extractCostUsd: 0.0038,
        transactionId: null,
        contentHash: 'sha256-fixture-02',
        totalsDisagree: false,
        frameCount: 1,
        hasProcessed: false,
        bindSource: null,
        boundAt: null,
        bindJevScore: null,
        bindCheckedAt: instantMinutesAgo(30),
        bindCheckOutcome: 'no-candidate',
    },
    {
        id: 'rcpt-03-hardware',
        createdAt: instantMinutesAgo(60 * 50),
        vendor: 'Ace Hardware',
        purchaseDate: isoDaysAgo(3),
        printedMilliunits: 41270,
        extractStatus: 'gated',
        extractJson: extractJson({
            vendor: 'Ace Hardware',
            lines: [
                ['Wood Screws #8 x 1-1/4in', 899],
                ['Painter Tape', 1299],
                ['Drop Cloth 9x12', 1899],
            ],
            tax: 3173,
        }),
        rawText: null,
        extractCostUsd: 0.0051,
        transactionId: null,
        contentHash: 'sha256-fixture-03',
        totalsDisagree: true,
        frameCount: 3,
        hasProcessed: true,
        bindSource: null,
        boundAt: null,
        bindJevScore: null,
        bindCheckedAt: instantMinutesAgo(45),
        bindCheckOutcome: 'ambiguous',
    },
    {
        id: 'rcpt-04-failed',
        createdAt: instantMinutesAgo(60 * 72),
        vendor: null,
        purchaseDate: null,
        printedMilliunits: null,
        extractStatus: 'failed',
        extractJson: JSON.stringify({ error: 'Image too blurry to read totals', lines: [] }),
        rawText: null,
        extractCostUsd: 0.0012,
        transactionId: null,
        contentHash: 'sha256-fixture-04',
        totalsDisagree: false,
        frameCount: 1,
        hasProcessed: false,
        bindSource: null,
        boundAt: null,
        bindJevScore: null,
        bindCheckedAt: null,
        bindCheckOutcome: null,
    },
];

/** A neutral receipt-tape placeholder, served for `/receipts/{id}/image`. */
export function receiptSvg(/** @type {string} */ label) {
    const safe = label.replace(/[<>&"']/g, '');
    const rows = Array.from({ length: 14 }, (_, index) => {
        const y = 90 + index * 26;
        const width = 140 + ((index * 37) % 90);
        return `<rect x="24" y="${y}" width="${width}" height="9" rx="2" fill="#c9c4b6"/><rect x="${300 - 24 - 46}" y="${y}" width="46" height="9" rx="2" fill="#c9c4b6"/>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="520" viewBox="0 0 300 520"><rect width="300" height="520" fill="#f4f1e8"/><text x="150" y="50" text-anchor="middle" font-family="monospace" font-size="18" fill="#3a382f">${safe}</text>${rows}<rect x="24" y="470" width="252" height="2" fill="#3a382f"/></svg>`;
}

// ---------------------------------------------------------------------------------------------
// Repeating

/**
 * @param {Omit<PeriodicSeriesDto, 'relatedTransactionIds' | 'lastDate'>} input
 * @returns {PeriodicSeriesDto}
 */
function series(input) {
    return {
        ...input,
        lastDate: input.relatedTransactions[0]?.date ?? isoDaysAgo(30),
        relatedTransactionIds: input.relatedTransactions.map((row) => row.id),
    };
}

/** @type {PeriodicSeriesDto[]} */
export const PERIODIC_SERIES = [
    series({
        id: 'series-netflix',
        payeeName: 'Netflix',
        cadence: 'Monthly',
        occurrenceCount: 14,
        medianAmount: -15490,
        expectedNextDate: isoDaysAgo(-28),
        category: 'Streaming Services',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 0.97,
        relatedTransactions: NETFLIX_HISTORY,
    }),
    series({
        id: 'series-pge',
        payeeName: 'PG&E',
        cadence: 'Monthly',
        occurrenceCount: 26,
        medianAmount: -131870,
        expectedNextDate: isoDaysAgo(-25),
        category: 'Electric & Gas',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 0.91,
        relatedTransactions: PGE_HISTORY,
    }),
    series({
        id: 'series-spotify',
        payeeName: 'Spotify',
        cadence: 'Monthly',
        occurrenceCount: 9,
        medianAmount: -11990,
        expectedNextDate: isoDaysAgo(-16),
        category: 'Software & Cloud Storage',
        categoryVoteShare: 0.67,
        categoryStable: false,
        cadenceFit: 0.95,
        relatedTransactions: SPOTIFY_HISTORY,
    }),
    series({
        id: 'series-rent',
        payeeName: 'Riverside Commons Apartments Property Management LLC',
        cadence: 'Monthly',
        occurrenceCount: 31,
        medianAmount: -2150000,
        expectedNextDate: isoDaysAgo(3),
        category: 'Rent',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 0.99,
        relatedTransactions: history(
            'rent',
            'Riverside Commons Apartments Property Management LLC',
            -2150000,
            'acc-checking',
            'cat-rent',
            [33, 63, 94],
        ),
    }),
    series({
        id: 'series-gym',
        payeeName: 'City Fitness',
        cadence: 'Biweekly',
        occurrenceCount: 40,
        medianAmount: -24990,
        expectedNextDate: isoDaysAgo(-5),
        category: null,
        categoryVoteShare: 0.4,
        categoryStable: false,
        cadenceFit: 0.72,
        relatedTransactions: history('gym', 'City Fitness', -24990, 'acc-main-card', 'cat-software', [9, 23, 37]),
    }),
    series({
        id: 'series-insurance',
        payeeName: 'Lemonade Insurance',
        cadence: 'Yearly',
        occurrenceCount: 3,
        medianAmount: -184000,
        expectedNextDate: isoDaysAgo(-200),
        category: 'Phone',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 0.88,
        relatedTransactions: history('ins', 'Lemonade Insurance', -184000, 'acc-checking', 'cat-phone', [165, 530]),
    }),
    series({
        id: 'series-water',
        payeeName: 'Water Bureau',
        cadence: 'Quarterly',
        occurrenceCount: 8,
        medianAmount: -96420,
        expectedNextDate: isoDaysAgo(-40),
        category: 'Electric & Gas',
        categoryVoteShare: 0.75,
        categoryStable: true,
        cadenceFit: 0.83,
        relatedTransactions: history('water', 'Water Bureau', -96420, 'acc-checking', 'cat-electric', [50, 141]),
    }),
];

// ---------------------------------------------------------------------------------------------
// Trips

/** @type {TravelWindowDto[]} */
export const TRAVEL_WINDOWS = [
    {
        id: 'trip-seattle',
        name: 'Seattle long weekend',
        kind: 'vacation',
        location: 'Seattle, WA',
        startDate: isoDaysAgo(9),
        endDate: isoDaysAgo(6),
        accounts: [
            { id: 'acc-travel-card', name: 'Travel Rewards Visa Signature' },
            { id: 'acc-main-card', name: 'Main Card' },
        ],
    },
    {
        id: 'trip-conference',
        name: 'Annual developer conference and partner offsite in Austin',
        kind: 'work',
        location: 'Austin, TX',
        startDate: isoDaysAgo(-16),
        endDate: isoDaysAgo(-20),
        accounts: [{ id: 'acc-travel-card', name: 'Travel Rewards Visa Signature' }],
    },
    {
        id: 'trip-family',
        name: 'Thanksgiving with family',
        kind: 'vacation',
        location: null,
        startDate: isoDaysAgo(-40),
        endDate: isoDaysAgo(-45),
        accounts: [],
    },
];

// ---------------------------------------------------------------------------------------------
// Spending chart

/** Deterministic pseudo-random in [0, 1). */
function noise(/** @type {number} */ seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

const SPEND_CATEGORIES = [
    { categoryId: 'cat-groceries', base: 38000, every: 3, windowDays: 7 },
    { categoryId: 'cat-dining', base: 22000, every: 4, windowDays: 1 },
    { categoryId: 'cat-fuel', base: 48000, every: 9, windowDays: 1 },
    { categoryId: 'cat-coffee', base: 6200, every: 2, windowDays: 1 },
    { categoryId: 'cat-household', base: 31000, every: 11, windowDays: 14 },
    { categoryId: 'cat-home-improvement', base: 120000, every: 23, windowDays: 30 },
    { categoryId: 'cat-streaming', base: 15490, every: 30, windowDays: 1 },
    { categoryId: 'cat-rideshare', base: 18000, every: 8, windowDays: 1 },
    { categoryId: 'cat-pharmacy', base: 14000, every: 17, windowDays: 1 },
];

/**
 * `GET /spend-chart?start&end`. Days come from the request so they match the browser's "today".
 * @param {string} start
 * @param {string} end
 * @returns {import('../../../../../packages/web-sdk/src/gen/types.gen').SpendChartDto}
 */
export function spendChart(start, end) {
    /** @type {string[]} */
    const days = [];
    const cursor = new Date(`${start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    while (cursor <= last && days.length < 800) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const categories = SPEND_CATEGORIES.map((spec, specIndex) => {
        const category = categoryById(spec.categoryId);
        const raw = days.map((day, dayIndex) => {
            const seed = Number(day.replaceAll('-', '')) + specIndex * 101;
            if (dayIndex % spec.every !== specIndex % spec.every) {
                return 0;
            }
            return Math.round(spec.base * (0.6 + noise(seed) * 0.8));
        });
        const total = raw.reduce((sum, value) => sum + value, 0);
        const daily = raw.map((_, index) => {
            if (spec.windowDays <= 1) {
                return raw[index];
            }
            let sum = 0;
            for (let back = 0; back < spec.windowDays && index - back >= 0; back++) {
                sum += raw[index - back];
            }
            return Math.round(sum / spec.windowDays);
        });
        return {
            categoryId: category.id,
            categoryName: category.name,
            groupName: category.groupName,
            windowDays: spec.windowDays,
            totalMilliunits: total,
            dailyMilliunits: daily,
        };
    });
    categories.sort((left, right) => right.totalMilliunits - left.totalMilliunits);
    return { startDate: start, endDate: end, days, categories };
}
