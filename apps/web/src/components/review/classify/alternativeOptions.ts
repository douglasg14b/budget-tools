import type { CategorizationProposalDto, CategoryOptionDto } from '@budget-tools/web-sdk';

export const ALTERNATIVE_SHORTCUT_COUNT = 3;

/**
 * Ranked options that are not the primary suggestion, for the 1–3 shortcuts.
 */
export function alternativeOptions(proposal: CategorizationProposalDto | null): CategoryOptionDto[] {
    if (!proposal) {
        return [];
    }
    return proposal.options
        .filter((option) => {
            if (proposal.suggestedCategoryId && option.categoryId) {
                return option.categoryId !== proposal.suggestedCategoryId;
            }
            return option.category !== proposal.suggestedCategory;
        })
        .slice(0, ALTERNATIVE_SHORTCUT_COUNT);
}
