import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Cookie name carrying the opaque session token. */
export const SESSION_COOKIE_NAME = 'budget_tools_session';

/** How long a session stays valid without use. Any request inside this window slides it forward. */
export const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Only slide a session's expiry when it is at least this stale. Without this floor every request
 * would issue a database UPDATE and a fresh Set-Cookie header; a day's granularity is invisible
 * against a 90-day window.
 */
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** 32 bytes of CSPRNG output, base64url-encoded. This is the only time the raw token exists. */
export function createSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Hashes a session token for storage and lookup. SHA-256 rather than argon2 is deliberate: the
 * token is full-entropy random, so there is no dictionary to defend against, and this runs on
 * every authenticated request.
 */
export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two session-token hashes, for callers that compare in memory. */
export function sessionTokenHashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function sessionExpiryFrom(now: Date): Date {
    return new Date(now.getTime() + SESSION_DURATION_MS);
}

export function isSessionExpired(expiresAt: Date, now: Date): boolean {
    return expiresAt.getTime() <= now.getTime();
}

/**
 * Whether a session's expiry should be slid forward on this request. Sessions are refreshed only
 * once they are `SESSION_REFRESH_AFTER_MS` past their last use, so ordinary traffic does not
 * write to the database on every call.
 */
export function shouldRefreshSession(lastUsedAt: Date, now: Date): boolean {
    return now.getTime() - lastUsedAt.getTime() >= SESSION_REFRESH_AFTER_MS;
}
