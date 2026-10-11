import { useEffect, useRef } from 'react';

import type { SwipePoint, SwipeStep } from './swipeGesture';
import { isSwipeExempt, readSwipe, readSwipeAxis, startsAtEdge } from './swipeGesture';

/** How far the card follows the finger, as a share of the drag. */
const DRAG_FOLLOW = 0.35;

type UseSwipeNavigationOptions = {
    /** Element that receives touches. Give it `touch-action: pan-y` so the browser keeps vertical scroll. */
    surface: HTMLElement | null;
    /** Element nudged sideways under the finger as feedback; defaults to `surface`. */
    card?: HTMLElement | null;
    enabled: boolean;
    onSwipe: (step: SwipeStep) => void;
};

/**
 * Horizontal swipes on a scrolling surface page between transactions. Vertical drags, edge swipes
 * and drags that start on text fields or pickers are left alone.
 */
export function useSwipeNavigation({ surface, card, enabled, onSwipe }: UseSwipeNavigationOptions): void {
    const onSwipeRef = useRef(onSwipe);
    onSwipeRef.current = onSwipe;

    useEffect(() => {
        if (!surface || !enabled) {
            return;
        }
        const moving = card ?? surface;
        let start: SwipePoint | null = null;
        let axis: 'horizontal' | 'vertical' | null = null;

        function settle(): void {
            moving.style.transition = 'transform 160ms ease';
            moving.style.transform = '';
        }

        function onStart(event: TouchEvent): void {
            const touch = event.touches[0];
            if (event.touches.length !== 1 || !touch || isSwipeExempt(event.target)) {
                start = null;
                return;
            }
            const point = { x: touch.clientX, y: touch.clientY };
            start = startsAtEdge(point, window.innerWidth) ? null : point;
            axis = null;
        }

        function onMove(event: TouchEvent): void {
            const touch = event.touches[0];
            if (!start || !touch) {
                return;
            }
            const now = { x: touch.clientX, y: touch.clientY };
            axis ??= readSwipeAxis(start, now);
            if (axis !== 'horizontal') {
                return;
            }
            moving.style.transition = 'none';
            moving.style.transform = `translateX(${(now.x - start.x) * DRAG_FOLLOW}px)`;
        }

        function onEnd(event: TouchEvent): void {
            const touch = event.changedTouches[0];
            const began = start;
            start = null;
            settle();
            if (!began || !touch || axis !== 'horizontal') {
                return;
            }
            const step = readSwipe(began, { x: touch.clientX, y: touch.clientY }, window.innerWidth);
            if (step) {
                onSwipeRef.current(step);
            }
        }

        function onCancel(): void {
            start = null;
            settle();
        }

        surface.addEventListener('touchstart', onStart, { passive: true });
        surface.addEventListener('touchmove', onMove, { passive: true });
        surface.addEventListener('touchend', onEnd, { passive: true });
        surface.addEventListener('touchcancel', onCancel, { passive: true });
        return () => {
            surface.removeEventListener('touchstart', onStart);
            surface.removeEventListener('touchmove', onMove);
            surface.removeEventListener('touchend', onEnd);
            surface.removeEventListener('touchcancel', onCancel);
            moving.style.transform = '';
            moving.style.transition = '';
        };
    }, [card, enabled, surface]);
}
