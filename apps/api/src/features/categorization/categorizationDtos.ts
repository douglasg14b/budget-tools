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
    | 'Excluded';

export type CategorizationFlagsDto = {
    isAmbiguous: boolean;
    isNovelImport: boolean;
    isExcluded: boolean;
    requiresManualReview: boolean;
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
    notes: string | null;
};

export type QueueSummaryDto = {
    total: number;
    autoApply: number;
    suggested: number;
    review: number;
    blocked: number;
};

export type TransactionDetailDto = {
    id: string;
    date: string;
    amount: number;
    memo: string | null;
    cleared: string;
    approved: boolean;
    accountId: string;
    accountName: string;
    payeeId: string | null;
    payeeName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    importId: string | null;
    importPayeeName: string | null;
};

export type CategorizationQueueItemDto = {
    transaction: TransactionDetailDto;
    proposal: CategorizationProposalDto;
};

export type CategorizationQueueDto = {
    summary: QueueSummaryDto;
    generatedAt: string;
    llm: boolean;
    items: CategorizationQueueItemDto[];
};

export type CategorizationQueueQuery = {
    tier?: string;
    accountId?: string;
    llm?: boolean;
    refresh?: boolean;
};

export type PredictJsonEnvelope = {
    summary: QueueSummaryDto;
    proposals: CategorizationProposalDto[];
};
