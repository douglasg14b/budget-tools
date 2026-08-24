import type { CategorizationQueueItemDto, LlmSuggestOverlayDto } from '@budget-tools/web-sdk';

import { isCertainProposal } from './isCertainProposal';

/**
 * True when the classify card should request a just-in-time LLM overlay.
 */
export function needsLlmSuggest(item: CategorizationQueueItemDto, decided: boolean): boolean {
    if (decided) {
        return false;
    }
    return !isCertainProposal(item.proposal);
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
 * Merges an LLM overlay onto a locally scored queue item without dropping local signals.
 */
export function applyLlmOverlay(
    item: CategorizationQueueItemDto,
    overlay: LlmSuggestOverlayDto,
): CategorizationQueueItemDto {
    if (isCertainProposal(item.proposal)) {
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

export function overlayQueryKey(item: CategorizationQueueItemDto): readonly string[] {
    const tx = item.transaction;
    return [tx.id, tx.date, String(tx.amount), tx.payeeName ?? '', tx.importPayeeNameOriginal ?? '', tx.memo ?? ''];
}
