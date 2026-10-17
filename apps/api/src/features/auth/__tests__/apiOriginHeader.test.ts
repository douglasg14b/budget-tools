import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { API_ORIGIN_HEADER, apiOriginHeaderMiddleware } from '../apiOriginHeader';

describe('apiOriginHeaderMiddleware', () => {
    it('marks the response as coming from this API and continues', () => {
        const setHeader = vi.fn();
        const next = vi.fn();

        apiOriginHeaderMiddleware({} as Request, { setHeader } as unknown as Response, next);

        expect(setHeader).toHaveBeenCalledWith(API_ORIGIN_HEADER, '1');
        expect(next).toHaveBeenCalledWith();
    });

    // The web SDK hardcodes the same name (packages/web-sdk/src/unauthorizedResponse.ts). Renaming
    // it here alone would make every API 401 look like an expired Cloudflare Access session.
    it('keeps the header name the web SDK expects', () => {
        expect(API_ORIGIN_HEADER).toBe('X-Budget-Tools-Api');
    });
});
