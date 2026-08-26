export type ApprovalTier = 'AutoApply' | 'Suggested' | 'Review' | 'Blocked';

export type CategorizationMethod =
    | 'ImportAmountLookup'
    | 'ImportLookup'
    | 'PayeeIdLookup'
    | 'CanonicalPayeeLookup'
    | 'PayeeClusterLookup'
    | 'PayeeModel'
    | 'HierarchicalModel'
    | 'CategoryModel'
    | 'PeriodicSeriesLookup'
    | 'Consensus'
    | 'LlmCategorization'
    | 'TravelWindow'
    | 'Excluded'
    | 'ManualReview'
    | 'None';

export type CategorizationRouteReason =
    | 'None'
    | 'ExcludedPayee'
    | 'ExcludedCheck'
    | 'AmbiguousMerchant'
    | 'UntrainedCategory'
    | 'NovelImportString'
    | 'LowConfidence';

export type ProposalGapReason =
    | 'None'
    | 'AmbiguousMerchant'
    | 'InsufficientAgreement'
    | 'TwoMethodSuggestion'
    | 'SingleMethodSuggestion'
    | 'ImportAmountNearMiss'
    | 'NoQualifiedSignals'
    | 'LlmSuggestion'
    | 'Excluded'
    | 'PeriodicConflict';

export type PayeeResolutionMethod = 'ExactLookup' | 'ClusterLookup' | 'Model' | 'Llm' | 'Unresolved';

export type CategorizationFlagsDto = {
    isAmbiguous: boolean;
    isNovelImport: boolean;
    isExcluded: boolean;
    requiresManualReview: boolean;
    isPeriodic: boolean;
    isPeriodicConflict: boolean;
    isTravelWindow: boolean;
};

export type TravelLocationMatch = 'match' | 'mismatch' | 'unknown' | 'unspecified';

export type TravelWindowHitDto = {
    id: string;
    name: string;
    kind: 'vacation' | 'work';
    targetCategory: string | null;
    location: string | null;
    locationMatch: TravelLocationMatch;
    merchantCity: string | null;
};

export type PeriodicCadence = 'Weekly' | 'Biweekly' | 'Monthly' | 'Quarterly' | 'Yearly';

export type PeriodicMatchDto = {
    cadence: PeriodicCadence;
    occurrenceCount: number;
    medianAmount: number;
    lastDate: string;
    /** Majority historical category, or null when the series has no usable labels. */
    category: string | null;
    categoryVoteShare: number;
    relatedTransactionIds: string[];
    cadenceFit: number;
};

export type MethodSignalDto = {
    method: CategorizationMethod;
    category: string;
    confidence: number;
};

export type CategoryOptionDto = {
    rank: number;
    category: string;
    categoryGroup: string | null;
    categoryId: string | null;
    confidence: number;
    supportingMethods: MethodSignalDto[];
};

export type ConfidenceIntervalDto = {
    top: number;
    second: number | null;
    third: number | null;
    spread: number;
};

export type PayeeSuggestionDto = {
    name: string;
    method: PayeeResolutionMethod;
    confidence: number;
    needsRename: boolean;
};

export type CategorizationProposalDto = {
    transactionId: string;
    tier: ApprovalTier;
    flags: CategorizationFlagsDto;
    suggestedCategory: string | null;
    suggestedCategoryGroup: string | null;
    suggestedCategoryId: string | null;
    confidence: number;
    method: CategorizationMethod;
    routeReason: CategorizationRouteReason;
    gapReason: ProposalGapReason;
    signals: MethodSignalDto[];
    agreeingSignals: MethodSignalDto[];
    options: CategoryOptionDto[];
    confidenceInterval: ConfidenceIntervalDto;
    featureText: string;
    resolvedPayee: string | null;
    payeeSuggestion: PayeeSuggestionDto | null;
    notes: string | null;
    periodicMatch: PeriodicMatchDto | null;
    travelWindow: TravelWindowHitDto | null;
};

export type QueueSummaryDto = {
    total: number;
    autoApply: number;
    suggested: number;
    review: number;
    blocked: number;
};

/** YNAB `cleared` field. Uncleared transactions are excluded from the review queue. */
export type TransactionClearedStatus = 'uncleared' | 'cleared' | 'reconciled';

export type TransactionDetailDto = {
    id: string;
    date: string;
    amount: number;
    memo: string | null;
    cleared: TransactionClearedStatus;
    approved: boolean;
    accountId: string;
    accountName: string;
    payeeId: string | null;
    payeeName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    importId: string | null;
    importPayeeName: string | null;
    importPayeeNameOriginal: string | null;
};

export type CategorizationQueueItemDto = {
    transaction: TransactionDetailDto;
    /** Local ML proposal when the transaction has been scored; otherwise null. */
    proposal: CategorizationProposalDto | null;
    /** Prior charges in this periodic series, newest first (ids from `proposal.periodicMatch`). */
    relatedTransactions: TransactionDetailDto[];
};

export type CategorizationQueueDto = {
    summary: QueueSummaryDto;
    generatedAt: string;
    llm: boolean;
    pendingCount: number;
    /** Unfiltered scored working-set size. */
    scoredCount: number;
    /** True when pending transactions exist that have not been scored yet. */
    hasMore: boolean;
    /** True when newer pending rows exist before this response window. */
    hasMoreNewer: boolean;
    /** True when older pending rows exist after this response window. */
    hasMoreOlder: boolean;
    items: CategorizationQueueItemDto[];
};

export type CategorizationQueueQuery = {
    tier?: string;
    accountId?: string;
    /** Case-insensitive substring filter over payee, import names, memo, category, account, date, and amount. */
    q?: string;
    refresh?: boolean;
    /** Score the next never-scored batch without discarding the current working set. */
    expand?: boolean;
    /** Center a pending window on this transaction id. */
    around?: string;
    /** Return the next older pending batch after this transaction id. */
    olderThan?: string;
    /** Return the next newer pending batch before this transaction id. */
    newerThan?: string;
};

export type CategorizationPredictRequestDto = {
    transactionIds: string[];
};

export type CategorizationPredictDto = {
    generatedAt: string;
    items: CategorizationQueueItemDto[];
};

export type LlmSuggestRequestDto = {
    transactionId: string;
};

export type LlmSuggestOverlayDto = {
    transactionId: string;
    model: string;
    suggestedCategory: string | null;
    suggestedCategoryGroup: string | null;
    suggestedCategoryId: string | null;
    confidence: number;
    notes: string | null;
    payeeSuggestion: PayeeSuggestionDto | null;
    /** Ranked LLM categories: primary first, then an optional everyday/trip counterpart. */
    options: CategoryOptionDto[];
};

export type PredictJsonEnvelope = {
    summary: QueueSummaryDto;
    proposals: CategorizationProposalDto[];
};
