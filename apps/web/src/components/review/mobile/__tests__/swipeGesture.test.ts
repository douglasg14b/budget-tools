import { describe, expect, it } from 'vitest';

import { readSwipe, readSwipeAxis, SWIPE_EDGE_GUARD, SWIPE_MIN_DISTANCE } from '../swipeGesture';

const WIDTH = 390;
const MIDDLE = { x: 195, y: 400 };

describe('readSwipe', () => {
    it('goes next on a rightward swipe and back on a leftward one', () => {
        expect(readSwipe(MIDDLE, { x: MIDDLE.x + 120, y: MIDDLE.y }, WIDTH)).toBe('next');
        expect(readSwipe(MIDDLE, { x: MIDDLE.x - 120, y: MIDDLE.y }, WIDTH)).toBe('previous');
    });

    it('ignores short drags and taps', () => {
        expect(readSwipe(MIDDLE, { x: MIDDLE.x + SWIPE_MIN_DISTANCE - 1, y: MIDDLE.y }, WIDTH)).toBeNull();
        expect(readSwipe(MIDDLE, MIDDLE, WIDTH)).toBeNull();
    });

    it('treats a mostly vertical drag as a scroll', () => {
        expect(readSwipe(MIDDLE, { x: MIDDLE.x + 90, y: MIDDLE.y + 120 }, WIDTH)).toBeNull();
    });

    it('leaves edge swipes to the operating system', () => {
        const leftEdge = { x: SWIPE_EDGE_GUARD - 1, y: 400 };
        const rightEdge = { x: WIDTH - SWIPE_EDGE_GUARD + 1, y: 400 };
        expect(readSwipe(leftEdge, { x: leftEdge.x + 200, y: 400 }, WIDTH)).toBeNull();
        expect(readSwipe(rightEdge, { x: rightEdge.x - 200, y: 400 }, WIDTH)).toBeNull();
    });
});

describe('readSwipeAxis', () => {
    it('waits for enough movement, then picks the dominant axis', () => {
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 4, y: MIDDLE.y + 3 })).toBeNull();
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 20, y: MIDDLE.y + 5 })).toBe('horizontal');
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 5, y: MIDDLE.y - 20 })).toBe('vertical');
    });
});
