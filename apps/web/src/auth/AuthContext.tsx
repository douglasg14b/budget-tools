import type { AuthUserDto } from '@budget-tools/web-sdk';
import { Auth, getMeQueryKey, postLoginMutation, postLogoutMutation } from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AuthStallState } from './authStallDiagnosis';
import type { AuthStatus } from './authStatus';
import { deriveAuthStatus } from './authStatus';
import { setUnauthorizedListener } from './unauthorizedListener';

export type { AuthStatus };

type AuthContextValue = {
    readonly user: AuthUserDto | null;
    readonly status: AuthStatus;
    readonly login: (credentials: { readonly username: string; readonly password: string }) => Promise<void>;
    readonly logout: () => Promise<void>;
    readonly isLoggingIn: boolean;
    readonly isLoggingOut: boolean;
    /** Raw `getMe` state, so a stalled splash can explain itself instead of spinning forever. */
    readonly stallState: AuthStallState;
    /** Re-runs the sign-in check. Surfaced so a stalled screen can offer a way out. */
    readonly retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** How often to re-ask while the API is unreachable, so the app comes back on its own. */
const UNREACHABLE_RECHECK_MS = 5_000;

/**
 * `GET /auth/me`, with a 401 resolved to `null` instead of thrown.
 *
 * The generated `getMeOptions` throws on every non-2xx, which made "you are signed out" and "the
 * API is down" the same rejection — and the app answered both with the login form. Resolving the
 * 401 here leaves a rejection meaning only "no answer", which `deriveAuthStatus` reports as
 * unreachable rather than signed out.
 */
async function fetchSignedInUser({ signal }: { signal: AbortSignal }): Promise<AuthUserDto | null> {
    const { data, error, response } = await Auth.request3({ signal });
    if (response?.status === 401) {
        return null;
    }
    if (error !== undefined || data === undefined) {
        // A network failure arrives as a TypeError; a proxy 502 as its raw (often HTML) body,
        // which is no use on screen, so the status stands in for it.
        throw error instanceof Error ? error : new Error(`The API answered HTTP ${response?.status ?? 'error'}.`);
    }
    return data;
}

/**
 * Owns sign-in state for the whole app.
 *
 * `GET /auth/me` is the single source of truth: a 200 means signed in, a 401 means anonymous, and
 * no answer at all means unreachable — which is not the same as signed out. Nothing is mirrored
 * into localStorage — the session lives in an HttpOnly cookie that JS cannot read, so any local
 * copy would only ever be a stale guess at what the browser is actually sending.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
    const queryClient = useQueryClient();

    const meQuery = useQuery({
        queryKey: getMeQueryKey(),
        queryFn: fetchSignedInUser,
        // Retries would hold the splash for their whole backoff before the unreachable screen
        // can say anything; the polling below does the waiting instead, with the screen up.
        retry: false,
        // While unreachable, keep asking: the moment the API answers, the user lands back in the
        // app (or on the login form) without having to think of refreshing.
        refetchInterval: (query) => (query.state.status === 'error' ? UNREACHABLE_RECHECK_MS : false),
        refetchOnWindowFocus: false,
        // The cookie can lapse server-side while the tab sits idle; letting the cached identity
        // go stale means a remount re-checks rather than trusting an old 200 indefinitely.
        staleTime: 30_000,
    });

    const loginMutation = useMutation(postLoginMutation());
    const logoutMutation = useMutation(postLogoutMutation());

    /**
     * Drops to anonymous without a network round trip. Removing the cached queries matters as
     * much as clearing the user: every cached query in this app is somebody's financial data, and
     * it must not survive into the next session shown in this tab.
     *
     * `getMe` is deliberately exempt. This runs from the SDK's 401 interceptor, which fires while
     * the offending response is still being processed — and on first load that response IS the
     * `getMe` 401. `queryClient.clear()` would remove that very query mid-flight, aborting its
     * fetch (`net::ERR_ABORTED`) so it never settles: the observer is torn down, a fresh query
     * takes its place in `pending`/`fetching`, and the app waits on a request that was cancelled
     * by its own 401 handler. That is a permanent "Loading…" splash for every signed-out visitor.
     *
     * Removing the others and then writing `null` here settles `getMe` as a definitive "signed
     * out" instead of destroying it.
     */
    const resetToAnonymous = useCallback(() => {
        const meKey = getMeQueryKey();
        queryClient.removeQueries({
            predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(meKey),
        });
        queryClient.setQueryData(meKey, null);
    }, [queryClient]);

    useEffect(() => setUnauthorizedListener(resetToAnonymous), [resetToAnonymous]);

    const login = useCallback(
        async (credentials: { readonly username: string; readonly password: string }) => {
            const result = await loginMutation.mutateAsync({ body: credentials });
            // Seed from the login response instead of refetching: the server just told us who
            // this is, and writing it synchronously avoids a frame of "loading" between a
            // successful submit and the app appearing.
            queryClient.setQueryData(getMeQueryKey(), result.user);
            await queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
        },
        [loginMutation, queryClient],
    );

    const logout = useCallback(async () => {
        try {
            await logoutMutation.mutateAsync({});
        } finally {
            // Even if the request failed we still tear down locally — a user who clicked Logout
            // should never be left looking at their data because the server was unreachable.
            resetToAnonymous();
        }
    }, [logoutMutation, resetToAnonymous]);

    // Counts how many times a `getMe` fetch has started, which is what separates a slow request
    // from one being cancelled and re-issued in a loop. Tracked in an effect rather than during
    // render: a render-phase mutation would double-count under StrictMode's double invocation.
    const [fetchStartCount, setFetchStartCount] = useState(0);
    const isFetching = meQuery.fetchStatus === 'fetching';
    useEffect(() => {
        if (isFetching) {
            setFetchStartCount((count) => count + 1);
        }
    }, [isFetching]);

    // `refetch` alone cannot recover a query that was removed from the cache, so reset first:
    // that restores it to a clean pending state from which a fetch can actually start.
    const retry = useCallback(() => {
        queryClient.resetQueries({ queryKey: getMeQueryKey() }).catch(() => {
            // A failed reset leaves the existing stall on screen, which is already the state
            // the user is looking at — nothing further to report.
        });
    }, [queryClient]);

    const value = useMemo<AuthContextValue>(() => {
        const user = meQuery.data ?? null;
        return {
            user,
            status: deriveAuthStatus({
                data: meQuery.data,
                isError: meQuery.isError,
            }),
            login,
            logout,
            isLoggingIn: loginMutation.isPending,
            isLoggingOut: logoutMutation.isPending,
            stallState: {
                status: meQuery.status,
                fetchStatus: meQuery.fetchStatus,
                failureCount: meQuery.failureCount,
                errorMessage: (meQuery.error as Error | null)?.message ?? null,
                startedCount: fetchStartCount,
            },
            retry,
        };
    }, [
        meQuery.data,
        meQuery.isError,
        meQuery.status,
        meQuery.fetchStatus,
        meQuery.failureCount,
        meQuery.error,
        fetchStartCount,
        login,
        logout,
        loginMutation.isPending,
        logoutMutation.isPending,
        retry,
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const value = useContext(AuthContext);
    if (!value) {
        throw new Error('useAuth requires AuthProvider');
    }
    return value;
}
