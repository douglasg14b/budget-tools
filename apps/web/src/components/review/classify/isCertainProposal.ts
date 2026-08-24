import type { CategorizationProposalDto } from '@budget-tools/web-sdk';

/** Shown on "Certain" labels: 100% confidence with a category to apply. */
export const CERTAIN_EXPLANATION = 'The model is at 100% confidence and has a category to apply.';

/**
 * True when the model reports whole-number 100% confidence and a category to apply.
 */
export function isCertainProposal(proposal: CategorizationProposalDto): boolean {
    return Math.round(proposal.confidence * 100) === 100 && Boolean(proposal.suggestedCategory);
}
