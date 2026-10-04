import { describe, expect, it } from 'vitest';

import { QueryValidationError } from '../../categorization/filterQueue';
import {
    completeClassificationDecision,
    parseClassificationDecision,
    validateClassificationDecision,
} from '../classificationDecision';
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

describe('parseClassificationDecision memo and flag', () => {
    it('keeps absent fields absent and explicit nulls as clears', () => {
        const absent = parseClassificationDecision(categoryDto());
        expect(absent).not.toHaveProperty('memo');
        expect(absent).not.toHaveProperty('flagColor');

        expect(parseClassificationDecision({ ...categoryDto(), memo: null, flagColor: null })).toEqual({
            kind: 'category',
            categoryId: 'cat-1',
            memo: null,
            flagColor: null,
        });
        expect(parseClassificationDecision({ ...splitDto(), memo: 'Costco run', flagColor: 'green' })).toMatchObject({
            kind: 'split',
            memo: 'Costco run',
            flagColor: 'green',
        });
    });

    it('trims memo edges, keeps inner text, and treats a blank memo as a clear', () => {
        expect(parseClassificationDecision({ ...categoryDto(), memo: '  two  spaces inside  ' })).toMatchObject({
            memo: 'two  spaces inside',
        });
        expect(parseClassificationDecision({ ...categoryDto(), memo: '   ' })).toMatchObject({ memo: null });
    });

    it('accepts a 500-character memo and rejects a longer one', () => {
        const limit = 'x'.repeat(500);
        expect(parseClassificationDecision({ ...categoryDto(), memo: limit })).toMatchObject({ memo: limit });
        expect(() => parseClassificationDecision({ ...categoryDto(), memo: `${limit}y` })).toThrow(
            QueryValidationError,
        );
    });

    it('rejects an unknown flag color', () => {
        expect(() =>
            parseClassificationDecision({
                ...categoryDto(),
                flagColor: 'pink' as unknown as ClassificationDecisionDto['flagColor'],
            }),
        ).toThrow(QueryValidationError);
    });
});

describe('parseClassificationDecision annotate', () => {
    it('parses a flag-only or memo-only annotation without approval', () => {
        expect(parseClassificationDecision({ transactionId: 'tx-1', kind: 'annotate', flagColor: 'red' })).toEqual({
            kind: 'annotate',
            flagColor: 'red',
        });
        expect(parseClassificationDecision({ transactionId: 'tx-1', kind: 'annotate', memo: null })).toEqual({
            kind: 'annotate',
            memo: null,
        });
    });

    it('requires a memo or flag', () => {
        expect(() => parseClassificationDecision({ transactionId: 'tx-1', kind: 'annotate' })).toThrow(
            QueryValidationError,
        );
    });

    it('rejects category, split, and payee fields', () => {
        const base: ClassificationDecisionDto = { transactionId: 'tx-1', kind: 'annotate', flagColor: 'red' };
        expect(() => parseClassificationDecision({ ...base, categoryId: 'cat-1' })).toThrow(QueryValidationError);
        expect(() => parseClassificationDecision({ ...base, lines: splitDto().lines })).toThrow(QueryValidationError);
        expect(() => parseClassificationDecision({ ...base, payeeName: 'Costco' })).toThrow(QueryValidationError);
    });

    it('attaches the mirrored approval when completed', () => {
        const draft = parseClassificationDecision({ transactionId: 'tx-1', kind: 'annotate', flagColor: 'blue' });
        expect(completeClassificationDecision(draft, false)).toEqual({
            kind: 'annotate',
            flagColor: 'blue',
            approved: false,
        });
        const category = parseClassificationDecision(categoryDto());
        expect(completeClassificationDecision(category, false)).toEqual(category);
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

    it('accepts an annotation without category checks', () => {
        expect(() =>
            validateClassificationDecision({ kind: 'annotate', flagColor: 'red' }, -1000, new Set()),
        ).not.toThrow();
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
