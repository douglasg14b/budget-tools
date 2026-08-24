export class LlmSuggestError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'LlmSuggestError';
        this.statusCode = statusCode;
    }
}
