import { describe, expect, it } from 'vitest';

import type { SwipePoint } from '../swipeGesture';
import {
    readSwipe,
    readSwipeAxis,
    SWIPE_COMMIT_SHARE,
    SWIPE_EDGE_GUARD,
    SWIPE_FLICK_MIN_DISTANCE,
    SWIPE_FLICK_VELOCITY,
    swipeSide,
} from '../swipeGesture';

const WIDTH = 390;
const MIDDLE = { x: 195, y: 400 };

function release(end: SwipePoint, velocityX = 0, start: SwipePoint = MIDDLE) {
    return readSwipe({ start, end, velocityX, width: WIDTH, viewportWidth: WIDTH });
}

describe('readSwipe', () => {
    it('goes next on a leftward swipe and back on a rightward one', () => {
        expect(release({ x: MIDDLE.x - 160, y: MIDDLE.y })).toBe('next');
        expect(release({ x: MIDDLE.x + 160, y: MIDDLE.y })).toBe('previous');
    });

    it('springs back from a slow drag that stops short', () => {
        const short = WIDTH * SWIPE_COMMIT_SHARE - 1;
        expect(release({ x: MIDDLE.x - short, y: MIDDLE.y })).toBeNull();
        expect(release(MIDDLE)).toBeNull();
    });

    it('pages on a short, fast flick in the drag direction', () => {
        const end = { x: MIDDLE.x - 40, y: MIDDLE.y };
        expect(release(end, -SWIPE_FLICK_VELOCITY)).toBe('next');
        // Flung back the other way before letting go: the card returns.
        expect(release(end, SWIPE_FLICK_VELOCITY)).toBeNull();
        expect(release({ x: MIDDLE.x - (SWIPE_FLICK_MIN_DISTANCE - 1), y: MIDDLE.y }, -1)).toBeNull();
    });

    it('treats a mostly vertical drag as a scroll', () => {
        expect(release({ x: MIDDLE.x - 150, y: MIDDLE.y + 200 }, -1)).toBeNull();
    });

    it('leaves edge swipes to the operating system', () => {
        const leftEdge = { x: SWIPE_EDGE_GUARD - 1, y: 400 };
        const rightEdge = { x: WIDTH - SWIPE_EDGE_GUARD + 1, y: 400 };
        expect(release({ x: leftEdge.x + 200, y: 400 }, 1, leftEdge)).toBeNull();
        expect(release({ x: rightEdge.x - 200, y: 400 }, -1, rightEdge)).toBeNull();
    });
});

describe('swipeSide', () => {
    it('waits the next card on the right, where a leftward drag pulls it from', () => {
        expect(swipeSide('next')).toBe('right');
        expect(swipeSide('previous')).toBe('left');
    });
});

describe('readSwipeAxis', () => {
    it('waits for enough movement, then picks the dominant axis', () => {
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 4, y: MIDDLE.y + 3 })).toBeNull();
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 20, y: MIDDLE.y + 5 })).toBe('horizontal');
        expect(readSwipeAxis(MIDDLE, { x: MIDDLE.x + 5, y: MIDDLE.y - 20 })).toBe('vertical');
    });
});
