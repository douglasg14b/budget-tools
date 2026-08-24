import type { PayeeSuggestionDto, TransactionDetailDto } from '../categorizationDtos';
import { isDirtierThanCurrent, isSamePayee, looksLikeImportName } from './looksLikeImportName';

/**
 * LLM payee overlay only when local rename is missing and the current name still looks like import text.
 */
export function applyLlmPayee(input: {
    readonly transaction: TransactionDetailDto;
    readonly localSuggestion: PayeeSuggestionDto | null;
    readonly llmPayeeName: string | null;
    readonly confidence: number;
}): PayeeSuggestionDto | null {
    if (input.localSuggestion?.needsRename) {
        return null;
    }

    const suggested = input.llmPayeeName?.trim();
    if (!suggested) {
        return null;
    }

    if (
        !looksLikeImportName(
            input.transaction.payeeName,
            input.transaction.importPayeeNameOriginal,
            input.transaction.importPayeeName,
        )
    ) {
        return null;
    }

    if (isSamePayee(suggested, input.transaction.payeeName)) {
        return null;
    }

    if (
        isDirtierThanCurrent(
            suggested,
            input.transaction.payeeName,
            input.transaction.importPayeeNameOriginal,
            input.transaction.importPayeeName,
        )
    ) {
        return null;
    }

    return {
        name: suggested,
        method: 'Llm',
        confidence: input.confidence,
        needsRename: true,
    };
}
