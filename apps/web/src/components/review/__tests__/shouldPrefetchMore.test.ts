import { describe, expect, it } from 'vitest';

import { shouldPrefetchMore, shouldPrefetchNewer } from '../shouldPrefetchMore';

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

describe('shouldPrefetchNewer', () => {
    it('does not prefetch when nothing newer remains', () => {
        expect(shouldPrefetchNewer(1, false)).toBe(false);
    });

    it('does not prefetch in the middle of a window', () => {
        expect(shouldPrefetchNewer(20, true)).toBe(false);
    });

    it('prefetches when the current row is within ten of the newest loaded item', () => {
        expect(shouldPrefetchNewer(10, true)).toBe(true);
        expect(shouldPrefetchNewer(1, true)).toBe(true);
    });
});
