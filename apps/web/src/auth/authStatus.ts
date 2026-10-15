import type { AuthUserDto } from '@budget-tools/web-sdk';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unreachable';

/**
 * Result shape of the `getMe` query, narrowed to the fields that decide sign-in state.
 *
 * Declared structurally rather than importing TanStack's `UseQueryResult` so this stays a plain
 * function with no React or query-client dependency — which is what makes it testable in the
 * `node` environment this workspace runs tests in.
 */
export type MeQuerySnapshot = {
    readonly data: AuthUserDto | null | undefined;
    readonly isError: boolean;
};

/**
 * Derives sign-in state from the `getMe` query.
 *
 * `data` is checked before the flags because it is the only thing that carries an actual answer:
 * a user means signed in, and `null` means the server said 401 (the query maps that to `null`
 * rather than rejecting, and the global 401 handler and logout write the same). TanStack keeps
 * `data` through a failed refetch, so a signed-in user whose background re-check hits a dead API
 * stays in the app instead of being thrown to a login form they do not need.
 *
 * A rejection with no answer on file is 'unreachable', NOT 'anonymous': the API being down says
 * nothing about whether the session cookie is still good. Showing the login form there misleads a
 * signed-in user into typing credentials that cannot fix anything.
 *
 * `isPending` is deliberately not consulted: in TanStack Query v5 it means "no data yet", not "a
 * request is in flight", so it can stay true after a rejection and would strand the visitor on the
 * splash screen. Anything without data or an error is simply still loading.
 */
export function deriveAuthStatus(meQuery: MeQuerySnapshot): AuthStatus {
    if (meQuery.data) {
        return 'authenticated';
    }
    if (meQuery.data === null) {
        return 'anonymous';
    }
    if (meQuery.isError) {
        return 'unreachable';
    }
    return 'loading';
}
