import 'reflect-metadata';

import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { ValidateError } from 'tsoa';

import { API_PORT } from './environment';
import { QueryValidationError } from './features/categorization/filterQueue';
import { PredictJsonError } from './features/categorization/predictJson';
import { RegisterRoutes } from './generated/routes';
import { getRequestId, requestContextMiddleware } from './services/requestContext';

export const app = express();
app.use(requestContextMiddleware);
app.use(express.json());

RegisterRoutes(app);

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

app.listen(API_PORT, () => {
    console.log(`API listening on http://localhost:${API_PORT}`);
});
