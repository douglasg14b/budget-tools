type UnauthorizedListener = () => void;

let listener: UnauthorizedListener | undefined;

/**
 * Bridges the SDK's `onUnauthorized` callback into React.
 *
 * `configureApiClient()` runs in `main.tsx` before `createRoot`, so the callback handed to
 * `setupClient` cannot close over a hook, a query client, or any component state — none of it
 * exists yet. This module-level slot is the seam: startup registers the notifier immediately,
 * and `AuthProvider` registers the real handler in an effect once React is mounted.
 *
 * A single listener rather than a set, because exactly one consumer (`AuthProvider`) ever cares,
 * and a single slot makes the double-subscribe of StrictMode's remount harmless — the second
 * subscribe replaces the first instead of stacking a duplicate handler.
 *
 * 401s that arrive before the provider mounts are dropped on purpose: the initial `getMe` query
 * resolves sign-in state on its own, so there is nothing for an early handler to add.
 */
export function setUnauthorizedListener(next: UnauthorizedListener): () => void {
    listener = next;
    return () => {
        if (listener === next) {
            listener = undefined;
        }
    };
}

export function notifyUnauthorized(): void {
    listener?.();
}
