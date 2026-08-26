import { describe, expect, it } from 'vitest';

import { shortenSplitMemo } from '../shortenSplitMemo';

describe('shortenSplitMemo', () => {
    it('keeps a short practical memo', () => {
        expect(shortenSplitMemo('16-pack small beach balls')).toBe('16-pack small beach balls');
    });

    it('drops a size catalog from a pasted Amazon title', () => {
        expect(shortenSplitMemo('16-pack assorted beach balls, 8-inch, 14-inch, 16-inch, and 24-inch')).toBe(
            '16-pack assorted beach balls',
        );
    });

    it('clips leftover title text at a word boundary', () => {
        expect(shortenSplitMemo('Ukontagood Premium Assorted Inflatable Beach Balls Party Pack for Kids')).toBe(
            'Ukontagood Premium Assorted Inflatable',
        );
    });
});
