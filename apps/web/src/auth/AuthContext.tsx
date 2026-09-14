import type { AuthUserDto } from '@budget-tools/web-sdk';
import { getMeOptions, getMeQueryKey, postLoginMutation, postLogoutMutation } from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

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
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns sign-in state for the whole app.
 *
 * `GET /auth/me` is the single source of truth: a 200 means signed in, a 401 means anonymous.
 * Nothing is mirrored into localStorage — the session lives in an HttpOnly cookie that JS cannot
 * read, so any local copy would only ever be a stale guess at what the browser is actually
 * sending.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
    const queryClient = useQueryClient();

    const meQuery = useQuery({
        ...getMeOptions(),
        // A 401 is a definitive answer ("you are signed out"), not a transient failure, so
        // retrying only delays the login form and prints avoidable console noise.
        retry: false,
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

    const value = useMemo<AuthContextValue>(() => {
        const user = meQuery.data ?? null;
        return {
            user,
            status: deriveAuthStatus({
                data: meQuery.data,
                isPending: meQuery.isPending,
                isError: meQuery.isError,
            }),
            login,
            logout,
            isLoggingIn: loginMutation.isPending,
            isLoggingOut: logoutMutation.isPending,
        };
    }, [
        meQuery.data,
        meQuery.isPending,
        meQuery.isError,
        login,
        logout,
        loginMutation.isPending,
        logoutMutation.isPending,
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
