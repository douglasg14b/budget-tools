import type { CategorizationProposalDto, PayeeSuggestionDto, TransactionDetailDto } from '@budget-tools/web-sdk';

import { payeeRenameSuggestion } from '../payeeRenameSuggestion';

export type PayeeEdits = {
    readonly dismissed: Readonly<Record<string, true>>;
    readonly names: Readonly<Record<string, string>>;
};

export function emptyPayeeEdits(): PayeeEdits {
    return { dismissed: {}, names: {} };
}

export function displayedPayeeName(transaction: TransactionDetailDto, edits: PayeeEdits): string {
    const edited = edits.names[transaction.id]?.trim();
    if (edited) {
        return edited;
    }
    return transaction.payeeName?.trim() || transaction.importPayeeName?.trim() || '';
}

export function setPayeeName(edits: PayeeEdits, transactionId: string, name: string): PayeeEdits {
    const trimmed = name.trim();
    if (!trimmed) {
        return edits;
    }
    return {
        dismissed: { ...edits.dismissed, [transactionId]: true },
        names: { ...edits.names, [transactionId]: trimmed },
    };
}

export function dismissPayeeRename(edits: PayeeEdits, transactionId: string): PayeeEdits {
    return {
        ...edits,
        dismissed: { ...edits.dismissed, [transactionId]: true },
    };
}

export function visiblePayeeRename(
    proposal: CategorizationProposalDto,
    transactionId: string,
    displayedPayee: string,
    edits: PayeeEdits,
): PayeeSuggestionDto | null {
    if (edits.dismissed[transactionId]) {
        return null;
    }

    const suggestion = payeeRenameSuggestion(proposal);
    if (!suggestion) {
        return null;
    }

    if (displayedPayee.localeCompare(suggestion.name, undefined, { sensitivity: 'accent' }) === 0) {
        return null;
    }

    return suggestion;
}
