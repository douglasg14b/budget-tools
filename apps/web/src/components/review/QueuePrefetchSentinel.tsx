import { useEffect, useRef } from 'react';

import classes from './QueuePrefetchSentinel.module.css';

type QueuePrefetchSentinelProps = {
    enabled: boolean;
    isLoading: boolean;
    onNeedMore: () => void;
    /**
     * Skip the first layout intersection so a short list cannot drain the
     * pending table while idle. Further expands wait for a scroll on `root`.
     */
    requireScroll?: boolean;
    /** Overflow container. Omit to observe against the viewport. */
    root?: Element | null;
};

/**
 * Fires `onNeedMore` when this marker nears the visible edge of `root`.
 */
export function QueuePrefetchSentinel({
    enabled,
    isLoading,
    onNeedMore,
    requireScroll = false,
    root,
}: QueuePrefetchSentinelProps) {
    const nodeRef = useRef<HTMLDivElement>(null);
    const allowExpandRef = useRef(!requireScroll);
    const useViewport = root === undefined;
    const observerRoot = useViewport ? null : root;

    useEffect(() => {
        if (!requireScroll) {
            allowExpandRef.current = true;
            return;
        }

        allowExpandRef.current = false;
        const scrollTarget: EventTarget = observerRoot ?? window;
        function onScroll(): void {
            allowExpandRef.current = true;
        }
        scrollTarget.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scrollTarget.removeEventListener('scroll', onScroll);
        };
    }, [observerRoot, requireScroll]);

    useEffect(() => {
        const node = nodeRef.current;
        if (!node || !enabled || isLoading || (!useViewport && !observerRoot)) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!allowExpandRef.current) {
                    return;
                }
                if (entries.some((entry) => entry.isIntersecting)) {
                    onNeedMore();
                }
            },
            { root: observerRoot, rootMargin: '320px 0px' },
        );
        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [enabled, isLoading, observerRoot, onNeedMore, useViewport]);

    return (
        <div ref={nodeRef} className={classes.sentinel}>
            {isLoading ? (
                <p className={classes.hint} aria-live="polite">
                    Scoring the next batch…
                </p>
            ) : null}
        </div>
    );
}
