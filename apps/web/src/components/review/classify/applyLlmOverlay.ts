import type {
    CategorizationQueueItemDto,
    CategoryOptionDto,
    LlmSuggestOverlayDto,
    ReceiptExtractStatus,
} from '@budget-tools/web-sdk';

import { isAmazonTransaction } from './isAmazonTransaction';
import { isCertainProposal } from './isCertainProposal';

export type ReceiptLlmSkip = {
    readonly autoBind: boolean;
    readonly boundToCurrent: boolean;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
};

/**
 * True when stored extract can seed the card: gated or ungated, totals in agreement.
 */
export function isReceiptExtractReady(skip: Pick<ReceiptLlmSkip, 'extractStatus' | 'totalsDisagree'>): boolean {
    return (skip.extractStatus === 'gated' || skip.extractStatus === 'ungated') && !skip.totalsDisagree;
}

/**
 * True when exact unique or an explicit card bind has a ready extract and generic llm-suggest should not run.
 * Bind persist is separate: a unique ready extract still skips LLM if Live bind has not written yet.
 */
export function receiptSkipsLlmSuggest(skip: ReceiptLlmSkip | null | undefined): boolean {
    if (!skip || !isReceiptExtractReady(skip)) {
        return false;
    }
    return skip.autoBind || skip.boundToCurrent;
}

/**
 * Builds the LLM skip from matcher auto-bind and/or an explicit card bind. Null means no receipt pair.
 */
export function buildReceiptLlmSkip(input: {
    readonly autoBind: boolean;
    readonly boundToCurrent: boolean;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
}): ReceiptLlmSkip | null {
    if (!input.autoBind && !input.boundToCurrent) {
        return null;
    }
    return {
        autoBind: input.autoBind,
        boundToCurrent: input.boundToCurrent,
        extractStatus: input.extractStatus,
        totalsDisagree: input.totalsDisagree,
    };
}

/**
 * True when a non-Amazon scored card should cheap-lookup receipts (never Amazon; never extract).
 */
export function needsReceiptLookup(item: CategorizationQueueItemDto, decided = false): boolean {
    if (decided || !item.proposal) {
        return false;
    }
    return !isAmazonTransaction(item.transaction);
}

/**
 * True when a focused card may offer camera/file capture. Amazon payees stay on amazon-suggest.
 */
export function canCaptureReceipt(item: CategorizationQueueItemDto): boolean {
    return !isAmazonTransaction(item.transaction);
}

/**
 * True when the classify card should request a just-in-time LLM overlay.
 */
export function needsLlmSuggest(
    item: CategorizationQueueItemDto,
    decided: boolean,
    receiptSkip?: ReceiptLlmSkip | null,
): boolean {
    if (decided || !item.proposal) {
        return false;
    }
    if (isAmazonTransaction(item.transaction)) {
        return false;
    }
    if (receiptSkipsLlmSuggest(receiptSkip)) {
        return false;
    }
    return !isCertainProposal(item.proposal);
}

export function needsAmazonSuggest(item: CategorizationQueueItemDto, _decided = false): boolean {
    if (!item.proposal) {
        return false;
    }
    return isAmazonTransaction(item.transaction);
}

/**
 * Next remaining uncertain item after the focused card, used to prefetch one overlay.
 */
export function nextUncertainRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return nextMatchingRemaining(remaining, currentId, (item) => needsLlmSuggest(item, false));
}

/**
 * Previous remaining uncertain item before the focused card, used to prefetch one overlay.
 */
export function previousUncertainRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return previousMatchingRemaining(remaining, currentId, (item) => needsLlmSuggest(item, false));
}

export type LlmPrefetchNeighbors = {
    readonly previous: CategorizationQueueItemDto | undefined;
    readonly next: CategorizationQueueItemDto | undefined;
};

function nextMatchingRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
    matches: (item: CategorizationQueueItemDto) => boolean,
): CategorizationQueueItemDto | undefined {
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    const after = start >= 0 ? remaining.slice(start + 1) : remaining;
    return after.find(matches);
}

function previousMatchingRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
    matches: (item: CategorizationQueueItemDto) => boolean,
): CategorizationQueueItemDto | undefined {
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    if (start <= 0) {
        return undefined;
    }

    for (let index = start - 1; index >= 0; index--) {
        const item = remaining[index];
        if (matches(item)) {
            return item;
        }
    }

    return undefined;
}

function selectMatchingPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
    matches: (item: CategorizationQueueItemDto) => boolean,
): LlmPrefetchNeighbors {
    return {
        previous: previousMatchingRemaining(remaining, currentId, matches),
        next: nextMatchingRemaining(remaining, currentId, matches),
    };
}

/** Uncertain neighbors above and below the focus for JIT LLM prefetch. */
export function selectLlmPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return selectMatchingPrefetchNeighbors(remaining, currentId, (item) => needsLlmSuggest(item, false));
}

export function nextAmazonRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return nextMatchingRemaining(remaining, currentId, (item) => needsAmazonSuggest(item, false));
}

export function previousAmazonRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return previousMatchingRemaining(remaining, currentId, (item) => needsAmazonSuggest(item, false));
}

/** Amazon neighbors above and below the focus for JIT Amazon-split prefetch. */
export function selectAmazonPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return selectMatchingPrefetchNeighbors(remaining, currentId, (item) => needsAmazonSuggest(item, false));
}

export function nextReceiptRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return nextMatchingRemaining(remaining, currentId, (item) => needsReceiptLookup(item, false));
}

export function previousReceiptRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    return previousMatchingRemaining(remaining, currentId, (item) => needsReceiptLookup(item, false));
}

/** Non-Amazon neighbors above and below the focus for cheap receipt lookup prefetch. */
export function selectReceiptPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return selectMatchingPrefetchNeighbors(remaining, currentId, (item) => needsReceiptLookup(item, false));
}

/**
 * Merges an LLM overlay onto a locally scored queue item without dropping local signals.
 */
export function applyLlmOverlay(
    item: CategorizationQueueItemDto,
    overlay: LlmSuggestOverlayDto,
): CategorizationQueueItemDto {
    if (!item.proposal || isCertainProposal(item.proposal)) {
        return item;
    }

    const payeeSuggestion = overlay.payeeSuggestion ?? item.proposal.payeeSuggestion;
    if (!overlay.suggestedCategory) {
        if (payeeSuggestion === item.proposal.payeeSuggestion && overlay.notes === item.proposal.notes) {
            return item;
        }
        return {
            ...item,
            proposal: {
                ...item.proposal,
                notes: overlay.notes ?? item.proposal.notes,
                payeeSuggestion,
            },
        };
    }

    const alreadyHasLlmSignal = item.proposal.signals.some(
        (signal) => signal.method === 'LlmCategorization' && signal.category === overlay.suggestedCategory,
    );

    return {
        ...item,
        proposal: {
            ...item.proposal,
            tier: item.proposal.tier === 'AutoApply' ? 'Suggested' : item.proposal.tier,
            suggestedCategory: overlay.suggestedCategory,
            suggestedCategoryGroup: overlay.suggestedCategoryGroup,
            suggestedCategoryId: overlay.suggestedCategoryId,
            confidence: overlay.confidence,
            method: 'LlmCategorization',
            gapReason: 'LlmSuggestion',
            notes: overlay.notes ?? item.proposal.notes,
            payeeSuggestion,
            options: mergeOverlayOptions(overlay, item.proposal.options),
            signals: alreadyHasLlmSignal
                ? item.proposal.signals
                : [
                      ...item.proposal.signals,
                      {
                          method: 'LlmCategorization',
                          category: overlay.suggestedCategory,
                          confidence: overlay.confidence,
                      },
                  ],
        },
    };
}

function mergeOverlayOptions(
    overlay: LlmSuggestOverlayDto,
    localOptions: readonly CategoryOptionDto[],
): CategoryOptionDto[] {
    const overlayOptions = overlay.options.length > 0 ? overlay.options : overlayPrimaryOption(overlay);
    const merged: CategoryOptionDto[] = [];
    const seen = new Set<string>();

    function take(option: CategoryOptionDto): void {
        const key = option.categoryId ?? option.category.trim().toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        merged.push({ ...option, rank: merged.length + 1 });
    }

    for (const option of overlayOptions) {
        take(option);
    }
    for (const option of localOptions) {
        take(option);
    }
    return merged;
}

function overlayPrimaryOption(overlay: LlmSuggestOverlayDto): CategoryOptionDto[] {
    if (!overlay.suggestedCategory) {
        return [];
    }
    return [
        {
            rank: 1,
            category: overlay.suggestedCategory,
            categoryGroup: overlay.suggestedCategoryGroup,
            categoryId: overlay.suggestedCategoryId,
            confidence: overlay.confidence,
            supportingMethods: [
                {
                    method: 'LlmCategorization',
                    category: overlay.suggestedCategory,
                    confidence: overlay.confidence,
                },
            ],
        },
    ];
}

export function overlayQueryKey(item: CategorizationQueueItemDto): readonly string[] {
    const tx = item.transaction;
    return [tx.id, tx.date, String(tx.amount), tx.payeeName ?? '', tx.importPayeeNameOriginal ?? '', tx.memo ?? ''];
}
