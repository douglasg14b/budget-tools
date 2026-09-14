import { describe, expect, it } from 'vitest';

import { readSessionCookie } from '../sessionCookie';
import { SESSION_COOKIE_NAME } from '../sessionToken';

describe('readSessionCookie', () => {
    it('reads the session token from the cookie jar', () => {
        expect(readSessionCookie({ [SESSION_COOKIE_NAME]: 'a-token' })).toBe('a-token');
    });

    it('returns undefined when the jar is missing or empty', () => {
        expect(readSessionCookie(undefined)).toBeUndefined();
        expect(readSessionCookie({})).toBeUndefined();
    });

    it('ignores a blank or whitespace-only cookie', () => {
        expect(readSessionCookie({ [SESSION_COOKIE_NAME]: '' })).toBeUndefined();
        expect(readSessionCookie({ [SESSION_COOKIE_NAME]: '   ' })).toBeUndefined();
    });

    it('ignores other cookies', () => {
        expect(readSessionCookie({ other: 'value' })).toBeUndefined();
    });

    it('ignores a non-string value, which cookie-parser can yield for repeated keys', () => {
        expect(readSessionCookie({ [SESSION_COOKIE_NAME]: ['a', 'b'] })).toBeUndefined();
        expect(readSessionCookie({ [SESSION_COOKIE_NAME]: { nested: true } })).toBeUndefined();
    });
});
