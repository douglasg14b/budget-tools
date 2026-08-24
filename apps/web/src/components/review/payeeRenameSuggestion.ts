import type { CategorizationProposalDto, PayeeSuggestionDto } from '@budget-tools/web-sdk';

export function payeeRenameSuggestion(proposal: CategorizationProposalDto): PayeeSuggestionDto | null {
    const suggestion = proposal.payeeSuggestion;
    if (!suggestion?.needsRename || !suggestion.name.trim()) {
        return null;
    }
    return suggestion;
}
