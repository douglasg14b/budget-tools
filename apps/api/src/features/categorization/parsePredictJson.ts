import type {
    ApprovalTier,
    CategorizationFlagsDto,
    CategorizationMethod,
    CategorizationProposalDto,
    CategorizationRouteReason,
    CategoryOptionDto,
    ConfidenceIntervalDto,
    MethodSignalDto,
    PayeeResolutionMethod,
    PayeeSuggestionDto,
    PeriodicCadence,
    PeriodicMatchDto,
    PredictJsonEnvelope,
    ProposalGapReason,
    QueueSummaryDto,
    TravelWindowHitDto,
} from './categorizationDtos';

export class PredictJsonError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'PredictJsonError';
    }
}

const APPROVAL_TIERS = new Set<ApprovalTier>(['AutoApply', 'Suggested', 'Review', 'Blocked']);

const CATEGORIZATION_METHODS = new Set<CategorizationMethod>([
    'ImportAmountLookup',
    'ImportLookup',
    'PayeeIdLookup',
    'CanonicalPayeeLookup',
    'PayeeClusterLookup',
    'PayeeModel',
    'HierarchicalModel',
    'CategoryModel',
    'PeriodicSeriesLookup',
    'Consensus',
    'LlmCategorization',
    'Excluded',
    'ManualReview',
    'None',
]);

const ROUTE_REASONS = new Set<CategorizationRouteReason>([
    'None',
    'ExcludedPayee',
    'ExcludedCheck',
    'AmbiguousMerchant',
    'UntrainedCategory',
    'NovelImportString',
    'LowConfidence',
]);

const GAP_REASONS = new Set<ProposalGapReason>([
    'None',
    'AmbiguousMerchant',
    'InsufficientAgreement',
    'TwoMethodSuggestion',
    'SingleMethodSuggestion',
    'ImportAmountNearMiss',
    'NoQualifiedSignals',
    'LlmSuggestion',
    'Excluded',
    'PeriodicConflict',
]);

const PERIODIC_CADENCES = new Set<PeriodicCadence>(['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Yearly']);

const PAYEE_RESOLUTION_METHODS = new Set<PayeeResolutionMethod>([
    'ExactLookup',
    'ClusterLookup',
    'Model',
    'Llm',
    'Unresolved',
]);

/**
 * Extracts the first JSON object from CLI stdout, ignoring any leading `dotnet` banners.
 */
export function extractJsonObject(stdout: string): string {
    const start = stdout.indexOf('{');
    if (start === -1) {
        throw new PredictJsonError('predict-json stdout did not contain a JSON object');
    }

    const end = stdout.lastIndexOf('}');
    if (end < start) {
        throw new PredictJsonError('predict-json stdout JSON object was truncated');
    }

    return stdout.slice(start, end + 1);
}

/**
 * Parses and validates the predict-json envelope from mixed CLI stdout.
 */
export function parsePredictJsonStdout(stdout: string): PredictJsonEnvelope {
    const jsonText = extractJsonObject(stdout);

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        throw new PredictJsonError('predict-json stdout was not valid JSON', { cause: error });
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new PredictJsonError('predict-json envelope must be an object');
    }

    const envelope = parsed as Record<string, unknown>;
    return {
        summary: parseSummary(envelope.summary),
        proposals: parseProposals(envelope.proposals),
    };
}

function parseSummary(value: unknown): QueueSummaryDto {
    if (!value || typeof value !== 'object') {
        throw new PredictJsonError('predict-json summary is missing');
    }

    const summary = value as Record<string, unknown>;
    return {
        total: requireNumber(summary.total, 'summary.total'),
        autoApply: requireNumber(summary.autoApply, 'summary.autoApply'),
        suggested: requireNumber(summary.suggested, 'summary.suggested'),
        review: requireNumber(summary.review, 'summary.review'),
        blocked: requireNumber(summary.blocked, 'summary.blocked'),
    };
}

function parseProposals(value: unknown): CategorizationProposalDto[] {
    if (!Array.isArray(value)) {
        throw new PredictJsonError('predict-json proposals must be an array');
    }

    return value.map((proposal, index) => parseProposal(proposal, index));
}

function parseProposal(value: unknown, index: number): CategorizationProposalDto {
    if (!value || typeof value !== 'object') {
        throw new PredictJsonError(`predict-json proposals[${index}] must be an object`);
    }

    const proposal = value as Record<string, unknown>;
    const transactionId = requireString(proposal.transactionId, `proposals[${index}].transactionId`);
    const tier = proposal.tier;
    if (!isApprovalTier(tier)) {
        throw new PredictJsonError(`proposals[${index}].tier is invalid`);
    }

    return {
        transactionId,
        tier,
        flags: parseFlags(proposal.flags, index),
        suggestedCategory: optionalString(proposal.suggestedCategory),
        suggestedCategoryGroup: optionalString(proposal.suggestedCategoryGroup),
        suggestedCategoryId: optionalString(proposal.suggestedCategoryId),
        confidence: requireNumber(proposal.confidence, `proposals[${index}].confidence`),
        method: parseMethod(proposal.method, index),
        routeReason: parseRouteReason(proposal.routeReason, index),
        gapReason: parseGapReason(proposal.gapReason, index),
        signals: parseSignals(proposal.signals, `proposals[${index}].signals`),
        agreeingSignals: parseSignals(proposal.agreeingSignals, `proposals[${index}].agreeingSignals`),
        options: parseOptions(proposal.options, index),
        confidenceInterval: parseConfidenceInterval(proposal.confidenceInterval, index),
        featureText: typeof proposal.featureText === 'string' ? proposal.featureText : '',
        resolvedPayee: optionalString(proposal.resolvedPayee),
        payeeSuggestion: parsePayeeSuggestion(proposal.payeeSuggestion, index),
        notes: optionalString(proposal.notes),
        periodicMatch: parsePeriodicMatch(proposal.periodicMatch, index),
        travelWindow: parseTravelWindow(proposal.travelWindow, index),
    };
}

function parseFlags(value: unknown, index: number): CategorizationFlagsDto {
    if (!value || typeof value !== 'object') {
        throw new PredictJsonError(`proposals[${index}].flags is missing`);
    }

    const flags = value as Record<string, unknown>;
    return {
        isAmbiguous: requireBoolean(flags.isAmbiguous, `proposals[${index}].flags.isAmbiguous`),
        isNovelImport: requireBoolean(flags.isNovelImport, `proposals[${index}].flags.isNovelImport`),
        isExcluded: requireBoolean(flags.isExcluded, `proposals[${index}].flags.isExcluded`),
        requiresManualReview: requireBoolean(
            flags.requiresManualReview,
            `proposals[${index}].flags.requiresManualReview`,
        ),
        isPeriodic: requireBoolean(flags.isPeriodic, `proposals[${index}].flags.isPeriodic`),
        isPeriodicConflict: requireBoolean(flags.isPeriodicConflict, `proposals[${index}].flags.isPeriodicConflict`),
        isTravelWindow: optionalBoolean(flags.isTravelWindow, false),
    };
}

function parseSignals(value: unknown, path: string): MethodSignalDto[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new PredictJsonError(`${path} must be an array`);
    }

    return value.map((signal, signalIndex) => {
        if (!signal || typeof signal !== 'object') {
            throw new PredictJsonError(`${path}[${signalIndex}] must be an object`);
        }
        const record = signal as Record<string, unknown>;
        return {
            method: parseMethod(record.method, signalIndex, path),
            category: requireString(record.category, `${path}[${signalIndex}].category`),
            confidence: requireNumber(record.confidence, `${path}[${signalIndex}].confidence`),
        };
    });
}

function parseOptions(value: unknown, index: number): CategoryOptionDto[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new PredictJsonError(`proposals[${index}].options must be an array`);
    }

    return value.map((option, optionIndex) => {
        if (!option || typeof option !== 'object') {
            throw new PredictJsonError(`proposals[${index}].options[${optionIndex}] must be an object`);
        }
        const record = option as Record<string, unknown>;
        return {
            rank: requireNumber(record.rank, `proposals[${index}].options[${optionIndex}].rank`),
            category: requireString(record.category, `proposals[${index}].options[${optionIndex}].category`),
            categoryGroup: optionalString(record.categoryGroup),
            categoryId: optionalString(record.categoryId),
            confidence: requireNumber(record.confidence, `proposals[${index}].options[${optionIndex}].confidence`),
            supportingMethods: parseSignals(
                record.supportingMethods,
                `proposals[${index}].options[${optionIndex}].supportingMethods`,
            ),
        };
    });
}

function parseConfidenceInterval(value: unknown, index: number): ConfidenceIntervalDto {
    if (!value || typeof value !== 'object') {
        return { top: 0, second: null, third: null, spread: 0 };
    }

    const interval = value as Record<string, unknown>;
    return {
        top: requireNumber(interval.top, `proposals[${index}].confidenceInterval.top`),
        second: optionalNumber(interval.second),
        third: optionalNumber(interval.third),
        spread: requireNumber(interval.spread, `proposals[${index}].confidenceInterval.spread`),
    };
}

function parsePayeeSuggestion(value: unknown, index: number): PayeeSuggestionDto | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object') {
        throw new PredictJsonError(`proposals[${index}].payeeSuggestion must be an object or null`);
    }

    const suggestion = value as Record<string, unknown>;
    const method = suggestion.method;
    if (typeof method !== 'string' || !PAYEE_RESOLUTION_METHODS.has(method as PayeeResolutionMethod)) {
        throw new PredictJsonError(`proposals[${index}].payeeSuggestion.method is invalid`);
    }

    return {
        name: requireString(suggestion.name, `proposals[${index}].payeeSuggestion.name`),
        method: method as PayeeResolutionMethod,
        confidence: requireNumber(suggestion.confidence, `proposals[${index}].payeeSuggestion.confidence`),
        needsRename: requireBoolean(suggestion.needsRename, `proposals[${index}].payeeSuggestion.needsRename`),
    };
}

function parsePeriodicMatch(value: unknown, index: number): PeriodicMatchDto | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object') {
        throw new PredictJsonError(`proposals[${index}].periodicMatch must be an object or null`);
    }

    const match = value as Record<string, unknown>;
    const cadence = match.cadence;
    if (typeof cadence !== 'string' || !PERIODIC_CADENCES.has(cadence as PeriodicCadence)) {
        throw new PredictJsonError(`proposals[${index}].periodicMatch.cadence is invalid`);
    }

    const relatedIds = match.relatedTransactionIds;
    if (!Array.isArray(relatedIds) || relatedIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        throw new PredictJsonError(
            `proposals[${index}].periodicMatch.relatedTransactionIds must be an array of non-empty strings`,
        );
    }

    const lastDate = requireString(match.lastDate, `proposals[${index}].periodicMatch.lastDate`);

    return {
        cadence: cadence as PeriodicCadence,
        occurrenceCount: requireNumber(match.occurrenceCount, `proposals[${index}].periodicMatch.occurrenceCount`),
        medianAmount: requireNumber(match.medianAmount, `proposals[${index}].periodicMatch.medianAmount`),
        lastDate,
        category: optionalNonEmptyString(match.category),
        categoryVoteShare: requireNumber(
            match.categoryVoteShare,
            `proposals[${index}].periodicMatch.categoryVoteShare`,
        ),
        relatedTransactionIds: relatedIds.filter((id): id is string => typeof id === 'string'),
        cadenceFit: requireNumber(match.cadenceFit, `proposals[${index}].periodicMatch.cadenceFit`),
    };
}

function parseMethod(value: unknown, index: number, path = `proposals[${index}].method`): CategorizationMethod {
    if (typeof value !== 'string' || !CATEGORIZATION_METHODS.has(value as CategorizationMethod)) {
        throw new PredictJsonError(`${path} is invalid`);
    }
    return value as CategorizationMethod;
}

function parseRouteReason(value: unknown, index: number): CategorizationRouteReason {
    if (typeof value !== 'string' || !ROUTE_REASONS.has(value as CategorizationRouteReason)) {
        throw new PredictJsonError(`proposals[${index}].routeReason is invalid`);
    }
    return value as CategorizationRouteReason;
}

function parseGapReason(value: unknown, index: number): ProposalGapReason {
    if (typeof value !== 'string' || !GAP_REASONS.has(value as ProposalGapReason)) {
        throw new PredictJsonError(`proposals[${index}].gapReason is invalid`);
    }
    return value as ProposalGapReason;
}

export function isApprovalTier(value: unknown): value is ApprovalTier {
    return typeof value === 'string' && APPROVAL_TIERS.has(value as ApprovalTier);
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new PredictJsonError(`${path} must be a non-empty string`);
    }
    return value;
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new PredictJsonError(`${path} must be a number`);
    }
    return value;
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new PredictJsonError(`${path} must be a boolean`);
    }
    return value;
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function optionalNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== 'boolean') {
        throw new PredictJsonError('flag boolean is invalid');
    }
    return value;
}

function parseTravelWindow(value: unknown, index: number): TravelWindowHitDto | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'object') {
        throw new PredictJsonError(`proposals[${index}].travelWindow must be an object or null`);
    }

    const window = value as Record<string, unknown>;
    const kind = window.kind;
    if (kind !== 'vacation' && kind !== 'work') {
        throw new PredictJsonError(`proposals[${index}].travelWindow.kind is invalid`);
    }

    return {
        id: requireString(window.id, `proposals[${index}].travelWindow.id`),
        name: requireString(window.name, `proposals[${index}].travelWindow.name`),
        kind,
        targetCategory: optionalNonEmptyString(window.targetCategory),
    };
}
