import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestContext = Readonly<{
    requestId: string;
}>;

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
    return getRequestContext()?.requestId;
}

export function requestContextMiddleware(_request: Request, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    requestContextStorage.run({ requestId }, next);
}
