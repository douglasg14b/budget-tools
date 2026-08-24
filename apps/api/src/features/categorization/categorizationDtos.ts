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

export type TravelWindowHitDto = {
    id: string;
    name: string;
    kind: 'vacation' | 'work';
    targetCategory: string | null;
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
    proposal: CategorizationProposalDto;
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
    items: CategorizationQueueItemDto[];
};

export type CategorizationQueueQuery = {
    tier?: string;
    accountId?: string;
    refresh?: boolean;
    /** Score the next never-scored batch without discarding the current working set. */
    expand?: boolean;
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
};

export type PredictJsonEnvelope = {
    summary: QueueSummaryDto;
    proposals: CategorizationProposalDto[];
};
