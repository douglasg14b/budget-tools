import type { NextFunction, Request, Response } from 'express';

/**
 * Response header the API puts on everything it answers, so the web client can tell this API's
 * 401 ("your app session is gone, show the login form") from a 401 that Cloudflare Access sends at
 * the edge ("your Access session expired, go back through Cloudflare's login") before the request
 * ever reaches the origin. Access's response cannot carry this header, so its absence is the
 * signal.
 *
 * It must be set here rather than in nginx: `pnpm dev` runs without nginx, and a marker missing in
 * dev would make every dev 401 look like an expired Access session.
 *
 * The web SDK names the same header (packages/web-sdk/src/unauthorizedResponse.ts). Nothing can
 * enforce that the two agree across packages, so changing either one means changing both.
 */
export const API_ORIGIN_HEADER = 'X-Budget-Tools-Api';

/** Registered first in server.ts, so error responses (413, 422, 500) carry the header too. */
export function apiOriginHeaderMiddleware(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader(API_ORIGIN_HEADER, '1');
    next();
}
