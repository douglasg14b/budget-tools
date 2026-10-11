import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

import type { SwipePoint, SwipeStep } from './swipeGesture';
import { isSwipeExempt, readSwipe, readSwipeAxis, startsAtEdge, swipeSide, swipeStepFor } from './swipeGesture';

/** Space (px) between neighbouring cards on the track; the sheet's CSS reads it as `--swipe-gap`. */
export const SWIPE_PAGE_GAP = 16;

/** How far the track gives when dragged toward a side with no card. */
const EDGE_RESISTANCE = 0.3;

const SLIDE_MS = 260;
const SETTLE_MS = 200;
const SLIDE_EASING = 'cubic-bezier(0.22, 0.8, 0.24, 1)';

/** Window (ms) of recent moves the release velocity is measured over. */
const VELOCITY_WINDOW_MS = 100;

type UseSwipeNavigationOptions = {
    /** Scrolling element that receives touches. Give it `touch-action: pan-y` to keep vertical scroll. */
    surface: HTMLElement | null;
    /**
     * Row holding the current card with its neighbours either side, translated under the finger.
     * Neighbours should sit `top: var(--swipe-scroll-top)` so they line up with what's on screen.
     */
    track: HTMLElement | null;
    enabled: boolean;
    /** Whether a card waits on that side; without one the drag resists and springs back. */
    canStep: (step: SwipeStep) => boolean;
    onSwipe: (step: SwipeStep) => void;
};

type Sample = { x: number; t: number };

/**
 * A card carousel on a scrolling surface: the track follows the finger, and a far-enough or
 * fast-enough release slides the neighbour all the way in before the focus moves. Vertical drags,
 * edge swipes and drags that start on text fields or pickers are left alone.
 *
 * Returns `slide`, which runs the same animation for buttons, optionally swapping the move for
 * another action (e.g. Accept, which also lands on the next card).
 */
export function useSwipeNavigation({ surface, track, enabled, canStep, onSwipe }: UseSwipeNavigationOptions) {
    const latest = useRef({ canStep, onSwipe, surface, track });
    latest.current = { canStep, onSwipe, surface, track };
    const sliding = useRef(false);

    const slide = useCallback((step: SwipeStep, action?: () => void) => {
        const { surface: scroller, track: row } = latest.current;
        const move = action ?? (() => latest.current.onSwipe(step));
        if (sliding.current) {
            return;
        }
        if (!scroller || !row || !latest.current.canStep(step) || prefersReducedMotion()) {
            move();
            return;
        }
        sliding.current = true;
        pinNeighbours(row, scroller);
        const distance = row.offsetWidth + SWIPE_PAGE_GAP;
        translate(row, swipeSide(step) === 'left' ? distance : -distance, `transform ${SLIDE_MS}ms ${SLIDE_EASING}`);
        afterTransition(row, SLIDE_MS, () => {
            // One synchronous render then the reset, so the new card lands centred in the same
            // frame instead of flashing the track's old position.
            flushSync(move);
            scroller.scrollTop = 0;
            translate(row, 0, 'none');
            unpinNeighbours(row);
            sliding.current = false;
        });
    }, []);

    useEffect(() => {
        if (!surface || !track || !enabled) {
            return;
        }
        const row = track;
        let start: SwipePoint | null = null;
        let axis: 'horizontal' | 'vertical' | null = null;
        let samples: Sample[] = [];

        function settle(): void {
            translate(row, 0, `transform ${SETTLE_MS}ms ${SLIDE_EASING}`);
            afterTransition(row, SETTLE_MS, () => {
                // A new drag may already have picked the track back up.
                if (!sliding.current && row.style.transform === '') {
                    unpinNeighbours(row);
                }
            });
        }

        function onStart(event: TouchEvent): void {
            const touch = event.touches[0];
            if (sliding.current || event.touches.length !== 1 || !touch || isSwipeExempt(event.target)) {
                start = null;
                return;
            }
            const point = { x: touch.clientX, y: touch.clientY };
            start = startsAtEdge(point, window.innerWidth) ? null : point;
            axis = null;
            samples = [{ x: point.x, t: event.timeStamp }];
        }

        function onMove(event: TouchEvent): void {
            const touch = event.touches[0];
            if (!start || !touch) {
                return;
            }
            const now = { x: touch.clientX, y: touch.clientY };
            if (axis === null) {
                axis = readSwipeAxis(start, now);
                if (axis === 'horizontal' && surface) {
                    pinNeighbours(row, surface);
                }
            }
            if (axis !== 'horizontal') {
                return;
            }
            // Owning the gesture: no vertical scroll creeping in under a sideways drag.
            if (event.cancelable) {
                event.preventDefault();
            }
            samples.push({ x: now.x, t: event.timeStamp });
            samples = samples.filter((sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS);
            const dx = now.x - start.x;
            translate(row, latest.current.canStep(swipeStepFor(dx)) ? dx : dx * EDGE_RESISTANCE, 'none');
        }

        function onEnd(event: TouchEvent): void {
            const touch = event.changedTouches[0];
            const began = start;
            start = null;
            if (!began || !touch || axis !== 'horizontal') {
                return;
            }
            const end = { x: touch.clientX, y: touch.clientY };
            const step = readSwipe({
                start: began,
                end,
                velocityX: velocity(samples, { x: end.x, t: event.timeStamp }),
                width: row.offsetWidth,
                viewportWidth: window.innerWidth,
            });
            if (step && latest.current.canStep(step)) {
                slide(step);
            } else {
                settle();
            }
        }

        function onCancel(): void {
            if (start && axis === 'horizontal') {
                settle();
            }
            start = null;
        }

        surface.addEventListener('touchstart', onStart, { passive: true });
        surface.addEventListener('touchmove', onMove, { passive: false });
        surface.addEventListener('touchend', onEnd, { passive: true });
        surface.addEventListener('touchcancel', onCancel, { passive: true });
        return () => {
            surface.removeEventListener('touchstart', onStart);
            surface.removeEventListener('touchmove', onMove);
            surface.removeEventListener('touchend', onEnd);
            surface.removeEventListener('touchcancel', onCancel);
            if (!sliding.current) {
                translate(row, 0, '');
                unpinNeighbours(row);
            }
        };
    }, [enabled, slide, surface, track]);

    return { slide };
}

function translate(row: HTMLElement, x: number, transition: string): void {
    row.style.transition = transition;
    row.style.transform = x === 0 ? '' : `translate3d(${x}px, 0, 0)`;
}

/** Lines the neighbours up with the visible top of the scrolled card. */
function pinNeighbours(row: HTMLElement, scroller: HTMLElement): void {
    row.style.setProperty('--swipe-scroll-top', `${scroller.scrollTop}px`);
}

function unpinNeighbours(row: HTMLElement): void {
    row.style.removeProperty('--swipe-scroll-top');
}

/** Runs once the track's transform transition ends, or after a timeout if it never fires. */
function afterTransition(row: HTMLElement, ms: number, done: () => void): void {
    let finished = false;
    function finish(): void {
        if (finished) {
            return;
        }
        finished = true;
        row.removeEventListener('transitionend', onEnd);
        window.clearTimeout(timer);
        done();
    }
    function onEnd(event: TransitionEvent): void {
        if (event.target === row && event.propertyName === 'transform') {
            finish();
        }
    }
    row.addEventListener('transitionend', onEnd);
    const timer = window.setTimeout(finish, ms + 80);
}

function velocity(samples: readonly Sample[], last: Sample): number {
    const first = samples[0];
    if (!first || last.t <= first.t) {
        return 0;
    }
    return (last.x - first.x) / (last.t - first.t);
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
