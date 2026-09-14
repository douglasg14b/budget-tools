import type { NextFunction, Request, Response } from 'express';

import { setCurrentUser } from '../../services/requestContext';
import { HttpError } from '../travelWindows/HttpError';
import { findSessionByToken, refreshSession } from './data/authRepo';
import { requiresAuthentication } from './publicRoutes';
import { clearSessionCookie, readSessionCookie, refreshSessionCookie } from './sessionCookie';
import { isSessionExpired, shouldRefreshSession } from './sessionToken';

/**
 * Validates the session cookie on every non-public request and publishes the user onto the
 * request context.
 *
 * This is the sliding-window half of the auth loop: a session that is being used stays alive
 * indefinitely, because each request more than a day past its last use pushes `expires_at` out to
 * a fresh 90 days and re-sends the cookie. A session left untouched for the full window expires
 * and forces a fresh login.
 *
 * Registered ahead of `RegisterRoutes` in `server.ts`, so it is default-deny: any controller added
 * later is protected without further wiring.
 */
export async function authMiddleware(request: Request, response: Response, next: NextFunction): Promise<void> {
    if (!requiresAuthentication(request.method, request.path)) {
        next();
        return;
    }

    const token = readSessionCookie(request.cookies as Record<string, unknown> | undefined);
    if (!token) {
        next(new HttpError(401, 'Not signed in.'));
        return;
    }

    try {
        const session = await findSessionByToken(token);
        const now = new Date();

        if (!session) {
            // Stale or forged cookie: clear it so the browser stops sending it.
            clearSessionCookie(response);
            next(new HttpError(401, 'Session is no longer valid.'));
            return;
        }

        if (isSessionExpired(session.expiresAt, now)) {
            clearSessionCookie(response);
            next(new HttpError(401, 'Session has expired. Sign in again.'));
            return;
        }

        setCurrentUser(session.user);

        if (shouldRefreshSession(session.lastUsedAt, now)) {
            const expiresAt = await refreshSession(session.sessionId, now);
            refreshSessionCookie(response, token, expiresAt);
        }

        next();
    } catch (error: unknown) {
        next(error);
    }
}
