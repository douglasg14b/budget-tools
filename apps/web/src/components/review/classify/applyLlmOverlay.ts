import type { CategorizationQueueItemDto, CategoryOptionDto, LlmSuggestOverlayDto } from '@budget-tools/web-sdk';

import { isAmazonTransaction } from './isAmazonTransaction';
import { isCertainProposal } from './isCertainProposal';

/**
 * True when the classify card should request a just-in-time LLM overlay.
 */
export function needsLlmSuggest(item: CategorizationQueueItemDto, decided: boolean): boolean {
    if (decided || !item.proposal) {
        return false;
    }
    if (isAmazonTransaction(item.transaction)) {
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
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    const after = start >= 0 ? remaining.slice(start + 1) : remaining;
    return after.find((item) => needsLlmSuggest(item, false));
}

/**
 * Previous remaining uncertain item before the focused card, used to prefetch one overlay.
 */
export function previousUncertainRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    if (start <= 0) {
        return undefined;
    }

    for (let index = start - 1; index >= 0; index--) {
        const item = remaining[index];
        if (needsLlmSuggest(item, false)) {
            return item;
        }
    }

    return undefined;
}

export type LlmPrefetchNeighbors = {
    readonly previous: CategorizationQueueItemDto | undefined;
    readonly next: CategorizationQueueItemDto | undefined;
};

/** Uncertain neighbors above and below the focus for JIT LLM prefetch. */
export function selectLlmPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return {
        previous: previousUncertainRemaining(remaining, currentId),
        next: nextUncertainRemaining(remaining, currentId),
    };
}

export function nextAmazonRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    const after = start >= 0 ? remaining.slice(start + 1) : remaining;
    return after.find((item) => needsAmazonSuggest(item, false));
}

export function previousAmazonRemaining(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): CategorizationQueueItemDto | undefined {
    const start = remaining.findIndex((item) => item.transaction.id === currentId);
    if (start <= 0) {
        return undefined;
    }

    for (let index = start - 1; index >= 0; index--) {
        const item = remaining[index];
        if (needsAmazonSuggest(item, false)) {
            return item;
        }
    }

    return undefined;
}

/** Amazon neighbors above and below the focus for JIT Amazon-split prefetch. */
export function selectAmazonPrefetchNeighbors(
    remaining: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): LlmPrefetchNeighbors {
    return {
        previous: previousAmazonRemaining(remaining, currentId),
        next: nextAmazonRemaining(remaining, currentId),
    };
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
