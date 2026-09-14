import 'reflect-metadata';

import { pathToFileURL } from 'node:url';

import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { ValidateError } from 'tsoa';
import { getAppDatabase } from './data-persistence/database';
import {
    API_LISTEN_HOST,
    API_PORT,
    CATEGORIZATION_QUEUE_CACHE_DIR,
    getAmazonOrdersMcpEntry,
    RECEIPTS_JSON_BODY_LIMIT,
} from './environment';
import { authMiddleware } from './features/auth/authMiddleware';
import { deleteExpiredSessions } from './features/auth/data/authRepo';
import { QueryValidationError } from './features/categorization/filterQueue';
import { LlmSuggestError } from './features/categorization/llm/LlmSuggestError';
import { clearLlmOverlayCache } from './features/categorization/llm/overlayCache';
import { PredictJsonError } from './features/categorization/predictJson';
import { sweepPendingReceiptExtracts } from './features/receipts/extractStoredReceipt';
import { HttpError } from './features/travelWindows/HttpError';
import { startOutboundSyncFlusher } from './features/ynabSync/flush/startOutboundSyncFlusher';
import { RegisterRoutes } from './generated/routes';
import { isPayloadTooLargeError, receiptsJsonBodyTooLargeMessage } from './payloadTooLarge';
import { getRequestId, requestContextMiddleware } from './services/requestContext';

export const app = express();
app.use(requestContextMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: RECEIPTS_JSON_BODY_LIMIT }));

// Default-deny: every route registered below requires a session except the handful named in
// `features/auth/publicRoutes.ts` (health, login, logout).
app.use(authMiddleware);

RegisterRoutes(app);

function requestBodyTransactionId(request: Request): string | undefined {
    const body = request.body;
    if (!body || typeof body !== 'object' || !('transactionId' in body)) {
        return undefined;
    }
    return typeof body.transactionId === 'string' ? body.transactionId : undefined;
}

function causeText(cause: unknown): string | undefined {
    if (cause instanceof Error) {
        return cause.stack ?? cause.message;
    }
    if (cause === undefined) {
        return undefined;
    }
    return String(cause);
}

function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void {
    if (isPayloadTooLargeError(error)) {
        response.status(413).json({
            message: receiptsJsonBodyTooLargeMessage(),
        });
        return;
    }

    if (error instanceof ValidateError) {
        response.status(422).json({
            details: error?.fields,
            message: 'Validation failed',
        });
        return;
    }

    if (error instanceof QueryValidationError) {
        response.status(422).json({
            message: error.message,
        });
        return;
    }

    if (error instanceof HttpError) {
        response.status(error.statusCode).json({
            message: error.message,
        });
        return;
    }

    if (error instanceof LlmSuggestError) {
        console.error('LLM suggest failed', {
            cause: causeText(error.cause),
            message: error.message,
            method: request.method,
            path: request.originalUrl,
            requestId: getRequestId(),
            statusCode: error.statusCode,
            transactionId: requestBodyTransactionId(request),
        });
        response.status(error.statusCode).json({
            message: error.message,
        });
        return;
    }

    if (error instanceof PredictJsonError) {
        response.status(503).json({
            message: error.message,
        });
        return;
    }

    console.error('API request failed', {
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        method: request.method,
        path: request.originalUrl,
        requestId: getRequestId(),
    });
    response.status(500).json({
        message: error instanceof Error ? error.message : 'Unknown server error',
    });
}

app.use(errorHandler);

async function start(): Promise<void> {
    console.log('API starting');
    await getAppDatabase();
    const sweptSessions = await deleteExpiredSessions(new Date());
    if (sweptSessions > 0) {
        console.log(`Swept ${sweptSessions} expired session(s)`);
    }
    await clearLlmOverlayCache(CATEGORIZATION_QUEUE_CACHE_DIR);
    startOutboundSyncFlusher();
    await sweepPendingReceiptExtracts();
    app.listen(API_PORT, API_LISTEN_HOST, () => {
        console.log(`API listening on http://${API_LISTEN_HOST}:${API_PORT}`);
        console.log(`Amazon MCP entry ${getAmazonOrdersMcpEntry() ?? 'unset'}`);
    });
}

/**
 * Only boot when run as the entrypoint. Importing this module for its `app` (the auth loop
 * verification script does exactly that) must not bind the API port or start the background
 * flusher and receipt sweep.
 */
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
    void start().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
}
