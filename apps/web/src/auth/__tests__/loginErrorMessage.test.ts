import { describe, expect, it } from 'vitest';

import { loginErrorMessage } from '../loginErrorMessage';

describe('loginErrorMessage', () => {
    it('prefers the server message on a 401', () => {
        expect(loginErrorMessage({ status: 401, message: 'Incorrect username or password.' })).toBe(
            'Incorrect username or password.',
        );
    });

    it('falls back to fixed credentials copy when a 401 carries nothing readable', () => {
        expect(loginErrorMessage({ status: 401 })).toBe('Incorrect username or password.');
        expect(loginErrorMessage({ status: 401, message: '   ' })).toBe('Incorrect username or password.');
    });

    it('replaces a bare framework "Unauthorized" with plain-language copy', () => {
        expect(loginErrorMessage({ status: 401, message: 'Unauthorized' })).toBe('Incorrect username or password.');
        expect(loginErrorMessage({ status: 401, message: 'unauthorized.' })).toBe('Incorrect username or password.');
    });

    it('surfaces validation text from a 400', () => {
        expect(loginErrorMessage({ status: 400, message: 'username is required' })).toBe('username is required');
    });

    it('reports an unreachable server distinctly from a rejected sign-in', () => {
        expect(loginErrorMessage(new TypeError('Failed to fetch'))).toBe(
            'Could not reach the server. Check your connection and try again.',
        );
    });

    it('falls back for unknown shapes and empty errors', () => {
        expect(loginErrorMessage({ status: 500 })).toBe('Sign-in failed. Please try again.');
        expect(loginErrorMessage(null)).toBe('Sign-in failed. Please try again.');
        expect(loginErrorMessage({})).toBe('Sign-in failed. Please try again.');
    });
});
