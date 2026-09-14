/**
 * What the `getMe` query looked like when the splash was declared stalled.
 *
 * Only the fields that distinguish the failure modes, so the diagnosis stays a pure function of
 * observable query state rather than of TanStack internals.
 */
export type AuthStallState = {
    /** TanStack's query status: 'pending' until data or an error arrives. */
    readonly status: 'pending' | 'error' | 'success';
    /** 'fetching' while a request is in flight, 'idle' when none is. */
    readonly fetchStatus: 'fetching' | 'paused' | 'idle';
    /** Failed attempts so far. Zero alongside a stuck 'pending' means nothing ever rejected. */
    readonly failureCount: number;
    readonly errorMessage: string | null;
    /**
     * How many times a fetch has *started* for this key.
     *
     * The signal that separates "slow" from "broken". A slow server yields exactly one start that
     * has not finished; a query being cancelled and re-created in a loop keeps starting new ones,
     * so anything above one while still pending means the request is not merely taking its time.
     */
    readonly startedCount: number;
};

export type AuthStallDiagnosis = {
    /** One line the user can act on. */
    readonly summary: string;
    /** The technical detail worth pasting into a bug report. */
    readonly detail: string;
};

/**
 * Explains why sign-in never resolved, in terms specific enough to be worth reading.
 *
 * A generic "something went wrong" would not have shortened either of the two outages this
 * guards against. The distinction that matters is whether a request is still outstanding
 * (network or server slow), whether one was cancelled without ever settling (the client-side
 * bug class), or whether it failed outright (server reachable, refusing).
 */
export function diagnoseAuthStall(state: AuthStallState): AuthStallDiagnosis {
    if (state.status === 'error') {
        return {
            summary: 'Could not reach the server to check whether you are signed in.',
            detail: state.errorMessage
                ? `The sign-in check failed: ${state.errorMessage}`
                : 'The sign-in check failed without reporting a reason.',
        };
    }

    if (state.fetchStatus === 'paused') {
        return {
            summary: 'You appear to be offline.',
            detail: 'The sign-in check is paused until the browser reports a network connection.',
        };
    }

    // Repeated starts with nothing ever settling: the request is being cancelled and re-issued
    // rather than merely running slowly. This is the shape of both bugs that stranded this
    // screen before, so it is named rather than blamed on the network.
    if (state.startedCount > 1) {
        return {
            summary: 'The sign-in check keeps restarting without finishing.',
            detail:
                `The request was cancelled and retried ${state.startedCount} times without ever ` +
                `completing (status: ${state.status}, fetchStatus: ${state.fetchStatus}, ` +
                `failures: ${state.failureCount}). This is usually a bug in the app rather than a ` +
                'problem with your connection.',
        };
    }

    if (state.fetchStatus === 'fetching') {
        return {
            summary: 'The server is taking longer than expected to respond.',
            detail: 'The sign-in check is still waiting for a reply. The server may be starting up.',
        };
    }

    // Idle and pending with a single start: no request is in flight and none ever settled, so the
    // one attempt made was abandoned before it could resolve.
    return {
        summary: 'The sign-in check stopped without finishing.',
        detail:
            `The request was cancelled before it completed (status: ${state.status}, ` +
            `fetchStatus: ${state.fetchStatus}, failures: ${state.failureCount}). ` +
            'This is usually a bug in the app rather than a problem with your connection.',
    };
}
