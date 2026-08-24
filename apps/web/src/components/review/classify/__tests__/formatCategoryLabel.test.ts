import { describe, expect, it } from 'vitest';

import { formatCategoryLabel } from '../formatCategoryLabel';

describe('formatCategoryLabel', () => {
    it('joins group and category when both exist', () => {
        expect(formatCategoryLabel('Groceries', 'Needs')).toBe('Needs: Groceries');
        expect(formatCategoryLabel('Groceries', null)).toBe('Groceries');
        expect(formatCategoryLabel(null, 'Needs')).toBeNull();
    });
});
