import { describe, expect, it } from 'vitest';

import { shouldPrefetchMore } from '../shouldPrefetchMore';

describe('shouldPrefetchMore', () => {
    it('does not prefetch when nothing remains to score', () => {
        expect(shouldPrefetchMore(41, 50, false)).toBe(false);
    });

    it('does not prefetch at the start of a full batch', () => {
        expect(shouldPrefetchMore(1, 50, true)).toBe(false);
    });

    it('prefetches when ten or fewer scored items remain after the current one', () => {
        expect(shouldPrefetchMore(40, 50, true)).toBe(true);
        expect(shouldPrefetchMore(50, 50, true)).toBe(true);
    });
});
