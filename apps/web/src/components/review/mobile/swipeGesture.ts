export type SwipeStep = 'next' | 'previous';

/**
 * What a rightward swipe does. Asked for as "swipe right to go next, left to go back" — the
 * reverse of a photo carousel, where dragging the card left reveals the next one. Flip this one
 * constant to switch.
 */
export const SWIPE_RIGHT_STEP: SwipeStep = 'next';

/** Horizontal travel (px) before a drag counts as a swipe. */
export const SWIPE_MIN_DISTANCE = 64;

/** Horizontal travel must beat vertical travel by this factor, so scrolling never pages. */
export const SWIPE_DOMINANCE = 1.6;

/** Touches starting this close (px) to either edge belong to the OS back / forward gesture. */
export const SWIPE_EDGE_GUARD = 24;

/** Movement (px) before the gesture commits to an axis. */
export const SWIPE_AXIS_SLOP = 10;

export type SwipePoint = { readonly x: number; readonly y: number };

/** The step a finished drag asks for, or `null` when it was a scroll, a tap, or an edge swipe. */
export function readSwipe(start: SwipePoint, end: SwipePoint, viewportWidth: number): SwipeStep | null {
    if (startsAtEdge(start, viewportWidth)) {
        return null;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < SWIPE_DOMINANCE * Math.abs(dy)) {
        return null;
    }
    if (dx > 0) {
        return SWIPE_RIGHT_STEP;
    }
    return SWIPE_RIGHT_STEP === 'next' ? 'previous' : 'next';
}

/** Which way a drag in progress is heading, once it has moved far enough to tell. */
export function readSwipeAxis(start: SwipePoint, now: SwipePoint): 'horizontal' | 'vertical' | null {
    const dx = Math.abs(now.x - start.x);
    const dy = Math.abs(now.y - start.y);
    if (Math.max(dx, dy) < SWIPE_AXIS_SLOP) {
        return null;
    }
    return dx > dy ? 'horizontal' : 'vertical';
}

export function startsAtEdge(start: SwipePoint, viewportWidth: number): boolean {
    return start.x < SWIPE_EDGE_GUARD || start.x > viewportWidth - SWIPE_EDGE_GUARD;
}

/** Controls that own horizontal drags themselves (text fields, pickers, sliders). */
const SWIPE_EXEMPT_SELECTOR = 'input, textarea, select, [role="slider"], [role="listbox"], [data-no-swipe]';

export function isSwipeExempt(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(SWIPE_EXEMPT_SELECTOR) !== null;
}
