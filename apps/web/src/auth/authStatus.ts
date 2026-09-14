import type { AuthUserDto } from '@budget-tools/web-sdk';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/**
 * Result shape of the `getMe` query, narrowed to the three flags that decide sign-in state.
 *
 * Declared structurally rather than importing TanStack's `UseQueryResult` so this stays a plain
 * function with no React or query-client dependency — which is what makes it testable in the
 * `node` environment this workspace runs tests in.
 */
export type MeQuerySnapshot = {
    readonly data: AuthUserDto | null | undefined;
    readonly isPending: boolean;
    readonly isError: boolean;
};

/**
 * Derives sign-in state from the `getMe` query.
 *
 * The error check comes first and that ordering is the whole point. In TanStack Query v5
 * `isPending` means "no data yet", NOT "a request is in flight" — so a query that rejects with
 * `retry: false` never sets data and leaves `isPending` true forever. Reading `isPending` alone
 * pins an anonymous visitor to 'loading' and strands them on the splash screen instead of the
 * login form.
 *
 * A failed `getMe` is treated as anonymous regardless of cause. A 401 is the expected signed-out
 * answer, and for anything else (network down, API 500) the login form is still the honest thing
 * to show: without a confirmed identity there is no session to render an app around.
 */
export function deriveAuthStatus(meQuery: MeQuerySnapshot): AuthStatus {
    if (meQuery.isError) {
        return 'anonymous';
    }
    if (meQuery.isPending) {
        return 'loading';
    }
    return meQuery.data ? 'authenticated' : 'anonymous';
}
