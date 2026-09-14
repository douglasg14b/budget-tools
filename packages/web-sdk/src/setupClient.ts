import type { Auth } from '@hey-api/client-fetch';

import { client } from './gen/client.gen';

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

/**
 * A 401 from any endpoint means the session is gone — expired, revoked, or never established.
 * Surfacing it centrally keeps every caller from having to special-case signed-out state.
 * `/auth/login` is exempt: a 401 there is a wrong password, not a lost session, and must be
 * reported to the login form rather than treated as a sign-out.
 */
function notifyUnauthorized(response: Response, request: Request): Response {
    if (response.status === 401 && !new URL(request.url).pathname.endsWith('/auth/login')) {
        unauthorizedHandler?.();
    }
    return response;
}

client.interceptors.response.use(notifyUnauthorized);

export function setupClient({ baseUrl, headers, auth, credentials, onUnauthorized }: SetupClientOptions): void {
    unauthorizedHandler = onUnauthorized;
    client.setConfig({
        baseUrl,
        headers,
        auth,
        credentials: credentials ?? 'same-origin',
    });
    isSetupComplete = true;
}
