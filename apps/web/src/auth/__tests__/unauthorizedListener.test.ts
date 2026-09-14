import { describe, expect, it, vi } from 'vitest';

import { notifyUnauthorized, setUnauthorizedListener } from '../unauthorizedListener';

describe('unauthorizedListener', () => {
    it('ignores a notification when nothing is subscribed', () => {
        expect(() => {
            notifyUnauthorized();
        }).not.toThrow();
    });

    it('forwards notifications to the current listener until it unsubscribes', () => {
        const listener = vi.fn();
        const unsubscribe = setUnauthorizedListener(listener);

        notifyUnauthorized();
        notifyUnauthorized();
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        notifyUnauthorized();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('replaces rather than stacks, so a StrictMode remount leaves one live handler', () => {
        const first = vi.fn();
        const second = vi.fn();

        setUnauthorizedListener(first);
        const unsubscribeSecond = setUnauthorizedListener(second);

        notifyUnauthorized();
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);

        unsubscribeSecond();
    });

    it('does not let a stale unsubscribe detach the listener that replaced it', () => {
        const stale = vi.fn();
        const current = vi.fn();

        const unsubscribeStale = setUnauthorizedListener(stale);
        setUnauthorizedListener(current);
        unsubscribeStale();

        notifyUnauthorized();
        expect(current).toHaveBeenCalledTimes(1);
        expect(stale).not.toHaveBeenCalled();
    });
});
