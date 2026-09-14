import { useEffect, useState } from 'react';

/** How long sign-in resolution may take before the splash is treated as stalled. */
export const AUTH_STALL_TIMEOUT_MS = 10_000;

/**
 * Reports whether a condition has stayed true for longer than it plausibly should.
 *
 * Exists because a stuck splash screen is indistinguishable from a slow one. Twice now the app
 * has shipped a bug where the `getMe` query never settled — once because a 401 handler cancelled
 * its own in-flight query, once because an errored query was misread as still-loading — and in
 * both cases the only symptom was a spinner that never stopped. A spinner cannot tell you it is
 * broken; a deadline can.
 *
 * The timer is deliberately tied to `active` rather than started once on mount: when sign-in
 * resolves normally the timer is cleared and never fires, and a later re-entry into the loading
 * state starts a fresh deadline rather than inheriting a stale one.
 */
export function useStallTimeout(active: boolean, timeoutMs: number = AUTH_STALL_TIMEOUT_MS): boolean {
    const [hasStalled, setHasStalled] = useState(false);

    useEffect(() => {
        if (!active) {
            // Resolving clears the stall: a recovered retry should drop the warning, not keep
            // showing it next to content that has since loaded.
            setHasStalled(false);
            return;
        }

        const timer = setTimeout(() => {
            setHasStalled(true);
        }, timeoutMs);

        return () => {
            clearTimeout(timer);
        };
    }, [active, timeoutMs]);

    return hasStalled;
}
