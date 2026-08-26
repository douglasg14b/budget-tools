import { describe, expect, it } from 'vitest';
import type { SplitLine } from '../splitLines';
import { collapsedSplitCategory, isCollapsedSplit, splitLinesSumTo, validateSplitLines } from '../splitLines';

describe('splitLines', () => {
    const groceries: SplitLine = {
        amount: -4000,
        categoryId: 'cat-g',
        categoryName: 'Groceries',
        categoryGroup: 'Needs',
        memo: 'Milk',
    };
    const household: SplitLine = {
        amount: -6000,
        categoryId: 'cat-h',
        categoryName: 'Household',
        categoryGroup: 'Needs',
        memo: 'Soap',
    };

    it('requires amounts to sum to the transaction', () => {
        expect(splitLinesSumTo([groceries, household], -10000)).toBe(true);
        expect(splitLinesSumTo([groceries, household], -9000)).toBe(false);
    });

    it('collapses when every line shares one category', () => {
        const second: SplitLine = { ...groceries, amount: -6000, memo: 'Eggs' };
        expect(isCollapsedSplit([groceries, second])).toBe(true);
        expect(collapsedSplitCategory([groceries, second])?.categoryId).toBe('cat-g');
        expect(isCollapsedSplit([groceries, household])).toBe(false);
    });

    it('rejects empty categories and unknown ids', () => {
        const ids = new Set(['cat-g', 'cat-h']);
        expect(validateSplitLines([groceries, household], -10000, ids)).toBeNull();
        expect(validateSplitLines([], -10000, ids)).toBe('Add at least one split line');
        expect(validateSplitLines([{ ...groceries, categoryId: '' }], -4000, ids)).toBe(
            'Every split line needs a category from the pick list',
        );
        expect(validateSplitLines([groceries], -4000, new Set())).toBe(
            'Every split line needs a category from the pick list',
        );
        expect(validateSplitLines([groceries], -1000, ids)).toBe('Split amounts must sum to the transaction amount');
    });
});
