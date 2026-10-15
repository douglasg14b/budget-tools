import type { AuthUserDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { deriveAuthStatus } from '../authStatus';

const USER = { id: 'user-1', username: 'douglas' } as AuthUserDto;

describe('deriveAuthStatus', () => {
    it('reports loading while the first getMe is still outstanding', () => {
        expect(deriveAuthStatus({ data: undefined, isError: false })).toBe('loading');
    });

    it('reports authenticated once getMe returns a user', () => {
        expect(deriveAuthStatus({ data: USER, isError: false })).toBe('authenticated');
    });

    it('reports anonymous when getMe answers 401', () => {
        // The query maps a 401 to `null`, as do the global 401 handler and logout.
        expect(deriveAuthStatus({ data: null, isError: false })).toBe('anonymous');
    });

    it('reports unreachable when the first getMe fails without an answer', () => {
        // Network down or the proxy's 502 says nothing about the session. Showing the login form
        // here sent signed-in users to re-enter credentials that could not help.
        expect(deriveAuthStatus({ data: undefined, isError: true })).toBe('unreachable');
    });

    it('keeps a signed-in user authenticated when a background re-check fails', () => {
        // TanStack keeps the last data through a failed refetch; an API blip must not sign the
        // user out of the tab they are using.
        expect(deriveAuthStatus({ data: USER, isError: true })).toBe('authenticated');
    });

    it('stays anonymous when a re-check fails after a 401', () => {
        expect(deriveAuthStatus({ data: null, isError: true })).toBe('anonymous');
    });
});
