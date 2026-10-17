import type { Auth } from '@hey-api/client-fetch';

import { client } from './gen/client.gen';
import { BACKGROUND_REQUEST_HEADERS, classifyUnauthorized } from './unauthorizedResponse';

export type SetupClientOptions = {
    baseUrl: string;
    headers?: Record<string, string>;
    auth: (auth: Auth) => Promise<string | undefined> | string | undefined;
    /**
     * Whether fetch attaches cookies. The session cookie is HttpOnly, so it is the browser — not
     * this client — that carries credentials; `same-origin` is enough because the web app is
     * served from the same origin as the `/api` proxy. Defaults to `same-origin`.
     */
    credentials?: RequestCredentials;
    /** Invoked when the API answers 401, so the app can drop to its signed-out state. */
    onUnauthorized?: () => void;
    /**
     * Invoked when Cloudflare Access answers 401 at the edge: the Access session expired, and the
     * request never reached the API. See `classifyUnauthorized`.
     */
    onEdgeSessionExpired?: () => void;
};

let isSetupComplete = false;

function ensureSetup(request: Request, _options: unknown): Request {
    if (!isSetupComplete) {
        throw new Error(
            'API client is not set up. Call setupClient({ baseUrl, auth }) once at app startup before using SDK hooks.',
        );
    }
    return request;
}

client.interceptors.request.use(ensureSetup);

let unauthorizedHandler: (() => void) | undefined;
let edgeSessionExpiredHandler: (() => void) | undefined;

/**
 * A 401 from the API means the app session is gone — expired, revoked, or never established — and
 * a 401 from Cloudflare Access means its session is. Surfacing both centrally keeps every caller
 * from having to special-case signed-out state. A 401 from `/auth/login` itself is a wrong
 * password, not a lost session, and is left for the login form to report. See
 * `classifyUnauthorized`.
 */
function notifyUnauthorized(response: Response, request: Request): Response {
    const kind = classifyUnauthorized(response, request.url);
    if (kind === 'edge') {
        edgeSessionExpiredHandler?.();
    } else if (kind === 'session') {
        unauthorizedHandler?.();
    }
    return response;
}

client.interceptors.response.use(notifyUnauthorized);

export function setupClient({
    baseUrl,
    headers,
    auth,
    credentials,
    onUnauthorized,
    onEdgeSessionExpired,
}: SetupClientOptions): void {
    unauthorizedHandler = onUnauthorized;
    edgeSessionExpiredHandler = onEdgeSessionExpired;
    client.setConfig({
        baseUrl,
        headers: { ...BACKGROUND_REQUEST_HEADERS, ...headers },
        auth,
        credentials: credentials ?? 'same-origin',
    });
    isSetupComplete = true;
}
