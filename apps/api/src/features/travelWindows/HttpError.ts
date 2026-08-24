export class HttpError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}

export class ConflictError extends HttpError {
    constructor(message: string) {
        super(409, message);
        this.name = 'ConflictError';
    }
}

export class NotFoundError extends HttpError {
    constructor(message: string) {
        super(404, message);
        this.name = 'NotFoundError';
    }
}
