import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** The authenticated principal for the current request, set by the auth middleware. */
export type RequestUser = Readonly<{
    id: string;
    username: string;
}>;

export type RequestContext = {
    readonly requestId: string;
    /** Undefined on public routes (health, login) and before the auth middleware has run. */
    user?: RequestUser;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
    return getRequestContext()?.requestId;
}

/**
 * The signed-in user for the current request, or undefined on public routes.
 * Controllers behind the auth middleware can rely on this being set.
 */
export function getCurrentUser(): RequestUser | undefined {
    return getRequestContext()?.user;
}

/**
 * Attaches the authenticated user to the active request context. Called by the auth middleware
 * once a session has been validated; mutates the store in place because the context object is
 * created upstream by `requestContextMiddleware`.
 */
export function setCurrentUser(user: RequestUser): void {
    const context = requestContextStorage.getStore();
    if (context) {
        context.user = user;
    }
}

export function requestContextMiddleware(_request: Request, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    requestContextStorage.run({ requestId }, next);
}
