import type { AuthUserDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { deriveAuthStatus } from '../authStatus';

const USER = { id: 'user-1', username: 'douglas' } as AuthUserDto;

describe('deriveAuthStatus', () => {
    it('reports loading while the first getMe is still outstanding', () => {
        expect(deriveAuthStatus({ data: undefined, isPending: true, isError: false })).toBe('loading');
    });

    it('reports authenticated once getMe returns a user', () => {
        expect(deriveAuthStatus({ data: USER, isPending: false, isError: false })).toBe('authenticated');
    });

    it('reports anonymous when getMe settles with no user', () => {
        expect(deriveAuthStatus({ data: null, isPending: false, isError: false })).toBe('anonymous');
    });

    it('reports anonymous when getMe 401s, even though isPending stays true', () => {
        // The regression that stranded the deployed app on "Loading…": a rejected query never
        // sets data, so TanStack leaves `isPending` true indefinitely. Checking `isPending`
        // before `isError` sends a signed-out visitor to the splash screen forever.
        expect(deriveAuthStatus({ data: undefined, isPending: true, isError: true })).toBe('anonymous');
    });

    it('reports anonymous when getMe fails for any other reason', () => {
        // Network failure or a 500 — without a confirmed identity the login form is the honest
        // thing to show, rather than an app shell with no session behind it.
        expect(deriveAuthStatus({ data: null, isPending: false, isError: true })).toBe('anonymous');
    });
});
