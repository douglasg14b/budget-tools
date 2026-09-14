import { describe, expect, it } from 'vitest';

import {
    createSessionToken,
    hashSessionToken,
    isSessionExpired,
    SESSION_DURATION_MS,
    SESSION_REFRESH_AFTER_MS,
    sessionExpiryFrom,
    sessionTokenHashesMatch,
    shouldRefreshSession,
} from '../sessionToken';

describe('createSessionToken', () => {
    it('produces a distinct high-entropy token each call', () => {
        const tokens = new Set(Array.from({ length: 100 }, () => createSessionToken()));
        expect(tokens.size).toBe(100);
    });

    it('produces url-safe tokens of at least 256 bits', () => {
        const token = createSessionToken();
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    });
});

describe('hashSessionToken', () => {
    it('is deterministic for the same token', () => {
        const token = createSessionToken();
        expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    });

    it('differs between tokens and never returns the token itself', () => {
        const token = createSessionToken();
        const hash = hashSessionToken(token);
        expect(hash).not.toBe(token);
        expect(hash).not.toBe(hashSessionToken(createSessionToken()));
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('sessionTokenHashesMatch', () => {
    it('matches identical hashes and rejects different ones', () => {
        const hash = hashSessionToken('token');
        expect(sessionTokenHashesMatch(hash, hash)).toBe(true);
        expect(sessionTokenHashesMatch(hash, hashSessionToken('other'))).toBe(false);
    });

    it('rejects rather than throwing when lengths differ', () => {
        expect(sessionTokenHashesMatch('short', hashSessionToken('token'))).toBe(false);
    });
});

describe('sessionExpiryFrom', () => {
    it('is 90 days out', () => {
        const now = new Date('2026-09-13T12:00:00.000Z');
        expect(sessionExpiryFrom(now).toISOString()).toBe('2026-12-12T12:00:00.000Z');
        expect(SESSION_DURATION_MS).toBe(90 * 24 * 60 * 60 * 1000);
    });
});

describe('isSessionExpired', () => {
    const now = new Date('2026-09-13T12:00:00.000Z');

    it('is false while the expiry is in the future', () => {
        expect(isSessionExpired(new Date(now.getTime() + 1000), now)).toBe(false);
    });

    it('is true at and after the expiry instant', () => {
        expect(isSessionExpired(new Date(now.getTime()), now)).toBe(true);
        expect(isSessionExpired(new Date(now.getTime() - 1000), now)).toBe(true);
    });
});

describe('shouldRefreshSession', () => {
    const now = new Date('2026-09-13T12:00:00.000Z');

    it('does not refresh a session used within the last day', () => {
        const lastUsedAt = new Date(now.getTime() - SESSION_REFRESH_AFTER_MS + 1000);
        expect(shouldRefreshSession(lastUsedAt, now)).toBe(false);
    });

    it('refreshes once the session is a full day stale', () => {
        const lastUsedAt = new Date(now.getTime() - SESSION_REFRESH_AFTER_MS);
        expect(shouldRefreshSession(lastUsedAt, now)).toBe(true);
    });

    it('refreshes a long-idle session that has not yet expired', () => {
        const lastUsedAt = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        expect(shouldRefreshSession(lastUsedAt, now)).toBe(true);
    });
});
