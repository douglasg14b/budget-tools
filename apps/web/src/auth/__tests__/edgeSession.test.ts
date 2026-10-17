import { API_ORIGIN_HEADER, classifyUnauthorized } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { EDGE_REAUTH_PATH, EDGE_REAUTH_RETRY_WINDOW_MS, shouldStartEdgeReauth } from '../edgeSession';

const ORIGIN = 'https://budget.moochermedia.co';

function response(status: number, fromApi: boolean): Pick<Response, 'status' | 'headers'> {
    return { status, headers: new Headers(fromApi ? { [API_ORIGIN_HEADER]: '1' } : {}) };
}

describe('classifyUnauthorized', () => {
    // The API hardcodes the same name (apps/api/src/features/auth/apiOriginHeader.ts). Renaming it
    // here alone would make every API 401 look like an expired Cloudflare Access session.
    it('expects the header name the API sends', () => {
        expect(API_ORIGIN_HEADER).toBe('X-Budget-Tools-Api');
    });

    it('ignores anything that is not a 401', () => {
        expect(classifyUnauthorized(response(200, true), `${ORIGIN}/api/auth/me`)).toBeUndefined();
        expect(classifyUnauthorized(response(403, false), `${ORIGIN}/api/auth/me`)).toBeUndefined();
    });

    it('reads an API 401 as a lost app session', () => {
        expect(classifyUnauthorized(response(401, true), `${ORIGIN}/api/auth/me`)).toBe('session');
    });

    it('leaves an API 401 from login to the login form', () => {
        expect(classifyUnauthorized(response(401, true), `${ORIGIN}/api/auth/login`)).toBe('credentials');
    });

    it('reads a 401 without the API marker as an expired Cloudflare Access session', () => {
        expect(classifyUnauthorized(response(401, false), `${ORIGIN}/api/categorization/queue`)).toBe('edge');
    });

    // After Access lapses, submitting the login form gets Access's 401. Reporting that as a wrong
    // password would never let the user in.
    it('treats an edge 401 on login as edge, not as a wrong password', () => {
        expect(classifyUnauthorized(response(401, false), `${ORIGIN}/api/auth/login`)).toBe('edge');
    });
});

describe('shouldStartEdgeReauth', () => {
    it('starts when no re-login has been tried in this tab', () => {
        expect(shouldStartEdgeReauth(undefined, 1_000_000)).toBe(true);
    });

    it('refuses a second attempt inside the retry window, so a misconfiguration cannot loop', () => {
        expect(shouldStartEdgeReauth(1_000_000, 1_000_000 + EDGE_REAUTH_RETRY_WINDOW_MS - 1)).toBe(false);
    });

    it('starts again once the window has passed', () => {
        expect(shouldStartEdgeReauth(1_000_000, 1_000_000 + EDGE_REAUTH_RETRY_WINDOW_MS)).toBe(true);
    });
});

describe('EDGE_REAUTH_PATH', () => {
    // The service worker only lets navigations under /api/ reach the network (vite.config.ts,
    // navigateFallbackDenylist). Anywhere else, it would answer from cache and Access would never
    // see the request.
    it('stays under /api/, where the service worker does not intercept navigations', () => {
        expect(EDGE_REAUTH_PATH.startsWith('/api/')).toBe(true);
    });
});
