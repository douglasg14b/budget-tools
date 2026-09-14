/**
 * Endpoints reachable without a session. Everything else is default-deny: a new controller is
 * protected the moment it is registered, with no opt-in step to forget.
 *
 * - `/api/health` stays open so container health checks and the nav badge work pre-login.
 * - `/api/auth/login` and `/api/auth/logout` must be reachable without a session by definition.
 * - `/api/auth/me` is deliberately NOT here: the web app calls it to discover whether it is
 *   signed in, and a 401 is the expected negative answer.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/health', '/auth/login', '/auth/logout']);

/**
 * Normalises a request path for matching: strips the query string, drops a trailing slash, and
 * lowercases. Express gives paths already mounted under the tsoa `/api` base path, which is
 * stripped here so the set above reads as route names.
 */
export function normalisePath(path: string): string {
    // Lowercase first: stripping the prefix before casefolding would leave an uppercase `/API/…`
    // un-stripped, so it would not match the set below.
    const lowercased = (path.split('?')[0] ?? '').toLowerCase();
    const withoutApiPrefix = lowercased.replace(/^\/api(?=\/|$)/, '');
    const trimmed = withoutApiPrefix.replace(/\/+$/, '');
    return trimmed || '/';
}

export function isPublicPath(path: string): boolean {
    return PUBLIC_PATHS.has(normalisePath(path));
}

/**
 * CORS preflight never carries cookies, so it must not be answered with a 401 or the browser
 * reports a CORS failure instead of the real auth state.
 */
export function isPreflight(method: string): boolean {
    return method.toUpperCase() === 'OPTIONS';
}

export function requiresAuthentication(method: string, path: string): boolean {
    return !isPreflight(method) && !isPublicPath(path);
}
