import { describe, expect, it } from 'vitest';

import { QueryValidationError } from '../../categorization/filterQueue';
import { parseClassificationDecision, validateClassificationDecision } from '../classificationDecision';
import type { ClassificationDecisionDto } from '../ynabSyncDtos';

describe('parseClassificationDecision', () => {
    it('parses a category decision and optional payee', () => {
        expect(parseClassificationDecision(categoryDto())).toEqual({ kind: 'category', categoryId: 'cat-1' });
        expect(parseClassificationDecision({ ...categoryDto(), payeeName: '  Costco  ' })).toEqual({
            kind: 'category',
            categoryId: 'cat-1',
            payeeName: 'Costco',
        });
    });

    it('parses split lines and rejects a parent categoryId', () => {
        expect(parseClassificationDecision(splitDto())).toEqual({
            kind: 'split',
            lines: [
                { amount: -400, categoryId: 'cat-1', memo: 'Milk' },
                { amount: -600, categoryId: 'cat-2', memo: null },
            ],
        });
        expect(() => parseClassificationDecision({ ...splitDto(), categoryId: 'cat-1' })).toThrow(QueryValidationError);
    });

    it('rejects empty category ids and split/category mix-ups', () => {
        expect(() => parseClassificationDecision({ ...categoryDto(), categoryId: '  ' })).toThrow(QueryValidationError);
        expect(() => parseClassificationDecision({ ...categoryDto(), lines: splitDto().lines })).toThrow(
            QueryValidationError,
        );
        expect(() => parseClassificationDecision({ ...splitDto(), lines: [] })).toThrow(QueryValidationError);
    });
});

describe('validateClassificationDecision', () => {
    const assignable = new Set(['cat-1', 'cat-2']);

    it('accepts an assignable category and a balanced split', () => {
        expect(() =>
            validateClassificationDecision({ kind: 'category', categoryId: 'cat-1' }, -1000, assignable),
        ).not.toThrow();
        expect(() =>
            validateClassificationDecision(parseClassificationDecision(splitDto()), -1000, assignable),
        ).not.toThrow();
    });

    it('rejects unknown categories and split totals that do not match', () => {
        expect(() =>
            validateClassificationDecision({ kind: 'category', categoryId: 'nope' }, -1000, assignable),
        ).toThrow(QueryValidationError);
        expect(() => validateClassificationDecision(parseClassificationDecision(splitDto()), -999, assignable)).toThrow(
            QueryValidationError,
        );
    });
});

function categoryDto(): ClassificationDecisionDto {
    return { transactionId: 'tx-1', kind: 'category', categoryId: 'cat-1' };
}

function splitDto(): ClassificationDecisionDto {
    return {
        transactionId: 'tx-1',
        kind: 'split',
        lines: [
            { amount: -400, categoryId: 'cat-1', memo: 'Milk' },
            { amount: -600, categoryId: 'cat-2', memo: '  ' },
        ],
    };
}
