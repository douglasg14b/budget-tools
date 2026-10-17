/**
 * Header the API sets on every response (apps/api/src/features/auth/apiOriginHeader.ts). Nothing
 * can enforce that the two agree across packages, so changing either one means changing both.
 */
export const API_ORIGIN_HEADER = 'X-Budget-Tools-Api';

/**
 * Sent on every SDK request. Cloudflare Access treats it as the mark of a background request, and
 * answers an expired Access session with a 401 instead of redirecting to its login page, which a
 * fetch could not follow anyway. Same-origin requests, so it triggers no CORS preflight.
 */
export const BACKGROUND_REQUEST_HEADERS: Readonly<Record<string, string>> = {
    'X-Requested-With': 'XMLHttpRequest',
};

/**
 * What a 401 means, which decides what the app should do about it.
 *
 * - `edge`: Cloudflare Access refused the request before it reached the API; its session expired.
 *   Only a page navigation through Cloudflare's login fixes it, so the app's login form is no use.
 * - `credentials`: the API rejected a login attempt. The login form reports it.
 * - `session`: the API has no valid app session for this browser. The app shows its login form.
 */
export type UnauthorizedKind = 'edge' | 'credentials' | 'session';

/**
 * Classifies a response, or returns undefined for anything that is not a 401.
 *
 * The edge check comes first and ignores the path. After an Access session lapses, submitting the
 * login form gets a 401 from Access, not the API, and reporting that as a wrong password would
 * send the user round in circles.
 */
export function classifyUnauthorized(
    response: Pick<Response, 'status' | 'headers'>,
    requestUrl: string,
): UnauthorizedKind | undefined {
    if (response.status !== 401) {
        return undefined;
    }
    if (!response.headers.has(API_ORIGIN_HEADER)) {
        return 'edge';
    }
    if (new URL(requestUrl).pathname.endsWith('/auth/login')) {
        return 'credentials';
    }
    return 'session';
}
