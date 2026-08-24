import 'reflect-metadata';

import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { ValidateError } from 'tsoa';
import { getAppDatabase } from './data-persistence/database';
import { API_PORT, CATEGORIZATION_QUEUE_CACHE_DIR } from './environment';
import { QueryValidationError } from './features/categorization/filterQueue';
import { LlmSuggestError } from './features/categorization/llm/LlmSuggestError';
import { clearLlmOverlayCache } from './features/categorization/llm/overlayCache';
import { PredictJsonError } from './features/categorization/predictJson';
import { HttpError } from './features/travelWindows/HttpError';
import { RegisterRoutes } from './generated/routes';
import { getRequestId, requestContextMiddleware } from './services/requestContext';

export const app = express();
app.use(requestContextMiddleware);
app.use(express.json());

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
    await getAppDatabase();
    await clearLlmOverlayCache(CATEGORIZATION_QUEUE_CACHE_DIR);
    app.listen(API_PORT, () => {
        console.log(`API listening on http://localhost:${API_PORT}`);
    });
}

void start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
