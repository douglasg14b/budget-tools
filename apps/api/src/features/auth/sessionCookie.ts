import type { CookieOptions, Response } from 'express';

import { SESSION_COOKIE_NAME } from './sessionToken';

/**
 * Cookie flags for the session token.
 *
 * - `httpOnly` keeps the token out of reach of JavaScript, so an XSS bug cannot exfiltrate it.
 * - `sameSite: 'lax'` means the cookie is not sent on cross-site POSTs, which is what blocks CSRF
 *   against the mutating endpoints. Top-level GET navigations still carry it, so following a link
 *   into the app keeps you logged in.
 * - `secure` is set outside development. Dev runs HTTPS via basic-ssl, but plain-HTTP loopback
 *   access (e.g. hitting the API directly on :4020) would silently drop a Secure cookie, so it is
 *   relaxed there and enforced everywhere else.
 * - No `domain` is set: the cookie stays host-only, and the web app is served same-origin with the
 *   API behind the `/api` proxy.
 */
function baseCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV !== 'development',
        path: '/',
    };
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
        ...baseCookieOptions(),
        expires: expiresAt,
    });
}

/** Re-sends the current token with a later expiry, so the browser extends its copy too. */
export function refreshSessionCookie(response: Response, token: string, expiresAt: Date): void {
    setSessionCookie(response, token, expiresAt);
}

export function clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions());
}

/** Reads the raw token from a parsed cookie jar. Returns undefined when absent or blank. */
export function readSessionCookie(cookies: Record<string, unknown> | undefined): string | undefined {
    const value = cookies?.[SESSION_COOKIE_NAME];
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
