import { describe, expect, it } from 'vitest';

import type { PayeeSuggestionDto, TransactionDetailDto } from '../../categorizationDtos';
import { applyLlmPayee } from '../applyLlmPayee';

describe('applyLlmPayee', () => {
    it('returns null when local rename already exists', () => {
        expect(
            applyLlmPayee({
                transaction: transaction({ payeeName: 'NETFLIX.COM', importPayeeNameOriginal: 'NETFLIX.COM' }),
                localSuggestion: localRename('Netflix'),
                llmPayeeName: 'Netflix Inc',
                confidence: 0.8,
            }),
        ).toBeNull();
    });

    it('returns an LLM rename when the current name looks like the import string', () => {
        expect(
            applyLlmPayee({
                transaction: transaction({ payeeName: 'NETFLIX.COM', importPayeeNameOriginal: 'NETFLIX.COM' }),
                localSuggestion: null,
                llmPayeeName: 'Netflix',
                confidence: 0.72,
            }),
        ).toEqual({
            name: 'Netflix',
            method: 'Llm',
            confidence: 0.72,
            needsRename: true,
        });
    });

    it('returns null when the LLM name is closer to the bank string than the current payee', () => {
        expect(
            applyLlmPayee({
                transaction: transaction({
                    payeeName: 'NETFLIX',
                    importPayeeNameOriginal: 'NETFLIX.COM *1234',
                }),
                localSuggestion: null,
                llmPayeeName: 'NETFLIX.COM *1234',
                confidence: 0.9,
            }),
        ).toBeNull();
    });

    it('returns null when the current payee is already clean', () => {
        expect(
            applyLlmPayee({
                transaction: transaction({ payeeName: 'Netflix', importPayeeNameOriginal: 'NETFLIX.COM' }),
                localSuggestion: null,
                llmPayeeName: 'Netflix Streaming',
                confidence: 0.9,
            }),
        ).toBeNull();
    });
});

function localRename(name: string): PayeeSuggestionDto {
    return { name, method: 'Model', confidence: 1, needsRename: true };
}

function transaction(overrides: Partial<TransactionDetailDto>): TransactionDetailDto {
    return {
        id: 'tx-1',
        date: '2026-08-01',
        amount: -14990,
        memo: null,
        cleared: 'cleared',
        approved: false,
        accountId: 'acct-1',
        accountName: 'Checking',
        payeeId: 'payee-1',
        payeeName: null,
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: null,
        importPayeeNameOriginal: null,
        ...overrides,
    };
}
