export type SwipeStep = 'next' | 'previous';

/**
 * What a rightward swipe does. Carousel-style: dragging the card left pulls in the next one from
 * the right, dragging it right brings back the previous one. The sheet lays the neighbour cards
 * out from this constant, so flipping it flips the whole carousel.
 */
export const SWIPE_RIGHT_STEP: SwipeStep = 'previous';

/** Share of the card's width a slow drag must cover before releasing it pages. */
export const SWIPE_COMMIT_SHARE = 0.3;

/** A flick this fast (px/ms) pages even when it is short. */
export const SWIPE_FLICK_VELOCITY = 0.35;

/** Shortest drag (px) a flick can be; below it a quick twitch stays a tap. */
export const SWIPE_FLICK_MIN_DISTANCE = 24;

/** Horizontal travel must beat vertical travel by this factor, so scrolling never pages. */
export const SWIPE_DOMINANCE = 1.6;

/** Touches starting this close (px) to either edge belong to the OS back / forward gesture. */
export const SWIPE_EDGE_GUARD = 24;

/** Movement (px) before the gesture commits to an axis. */
export const SWIPE_AXIS_SLOP = 10;

export type SwipePoint = { readonly x: number; readonly y: number };

export type SwipeRelease = {
    start: SwipePoint;
    end: SwipePoint;
    /** Horizontal speed (px/ms) over the last few moves; signed like the drag. */
    velocityX: number;
    /** Width of the swiped card, which sets how far a slow drag must go. */
    width: number;
    viewportWidth: number;
};

/** Which side of the current card a step's neighbour waits on. */
export function swipeSide(step: SwipeStep): 'left' | 'right' {
    return step === SWIPE_RIGHT_STEP ? 'left' : 'right';
}

/** The step a drag of this sign heads toward. */
export function swipeStepFor(dx: number): SwipeStep {
    if (dx > 0) {
        return SWIPE_RIGHT_STEP;
    }
    return SWIPE_RIGHT_STEP === 'next' ? 'previous' : 'next';
}

/**
 * The step a finished drag asks for, or `null` when it was a scroll, a tap, an edge swipe, or a
 * drag let go before it went far or fast enough.
 */
export function readSwipe({ start, end, velocityX, width, viewportWidth }: SwipeRelease): SwipeStep | null {
    if (startsAtEdge(start, viewportWidth)) {
        return null;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 || Math.abs(dx) < SWIPE_DOMINANCE * Math.abs(dy)) {
        return null;
    }
    const far = Math.abs(dx) >= width * SWIPE_COMMIT_SHARE;
    const flicked =
        Math.abs(dx) >= SWIPE_FLICK_MIN_DISTANCE &&
        Math.abs(velocityX) >= SWIPE_FLICK_VELOCITY &&
        Math.sign(velocityX) === Math.sign(dx);
    return far || flicked ? swipeStepFor(dx) : null;
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
