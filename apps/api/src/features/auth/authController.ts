import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Body, Get, Post, Request, Route, Tags } from 'tsoa';

import { getCurrentUser } from '../../services/requestContext';
import { HttpError } from '../travelWindows/HttpError';
import type { AuthUserDto, LoginRequestDto, LoginResponseDto, LogoutResponseDto } from './authDtos';
import { authenticateUser } from './authenticate';
import { createSession, deleteSession, findSessionByToken } from './data/authRepo';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './sessionCookie';
import { createSessionToken } from './sessionToken';

/**
 * Express always populates `request.res` for a request being handled; the type is optional only
 * because the same interface is reused outside the request cycle. Failing loud beats a non-null
 * assertion: silently skipping the Set-Cookie header would look like a successful login that
 * never actually signs anyone in.
 */
function responseFor(request: ExpressRequest): ExpressResponse {
    const { res } = request;
    if (!res) {
        throw new HttpError(500, 'No response object is attached to this request.');
    }
    return res;
}

@Route('auth')
@Tags('auth')
export class AuthController {
    /**
     * Exchanges a username and password for a long-lived session cookie.
     * @summary postLogin
     */
    @Post('login')
    public async postLogin(
        @Body() body: LoginRequestDto,
        @Request() request: ExpressRequest,
    ): Promise<LoginResponseDto> {
        const username = body.username?.trim() ?? '';
        const password = body.password ?? '';

        if (!username || !password) {
            throw new HttpError(400, 'Username and password are required.');
        }

        const user = await authenticateUser(username, password);
        if (!user) {
            // Same message for unknown user and wrong password: do not disclose which usernames exist.
            throw new HttpError(401, 'Incorrect username or password.');
        }

        const token = createSessionToken();
        const { expiresAt } = await createSession(user.id, token, new Date());
        setSessionCookie(responseFor(request), token, expiresAt);

        return {
            user: { id: user.id, username: user.username },
            expiresAt: expiresAt.toISOString(),
        };
    }

    /**
     * Clears the current session. Safe to call when already signed out.
     * @summary postLogout
     */
    @Post('logout')
    public async postLogout(@Request() request: ExpressRequest): Promise<LogoutResponseDto> {
        const token = readSessionCookie(request.cookies as Record<string, unknown> | undefined);
        if (token) {
            const session = await findSessionByToken(token);
            if (session) {
                await deleteSession(session.sessionId);
            }
        }

        clearSessionCookie(responseFor(request));
        return { ok: true };
    }

    /**
     * The signed-in user. 401s when there is no valid session — this is how the web app
     * discovers whether it needs to show the login page.
     * @summary getMe
     */
    @Get('me')
    public getMe(): AuthUserDto {
        const user = getCurrentUser();
        if (!user) {
            // Unreachable in practice: the auth middleware gates this route. Kept as a guard so
            // the handler is still correct if the middleware wiring ever changes.
            throw new HttpError(401, 'Not signed in.');
        }
        return { id: user.id, username: user.username };
    }
}
