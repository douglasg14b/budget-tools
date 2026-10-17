/**
 * Recovery from an expired Cloudflare Access session on the public hostname.
 *
 * Access sits in front of the app on budget.moochermedia.co (infra/index.ts). When its session
 * lapses, API calls get a 401 from Access, not from the API (the SDK tells the two apart; see
 * `classifyUnauthorized`). The app's own login form cannot fix that. Only a page navigation can:
 * Access answers it with a redirect to Cloudflare's login, and then sends the browser back.
 *
 * A plain reload is not enough here. The service worker answers navigations from its precached
 * `index.html` without touching the network, so Access would never see the request and the app
 * would reload into the same 401. This path is under `/api/`, which the service worker's
 * `navigateFallbackDenylist` excludes (vite.config.ts), so the navigation really goes out. nginx
 * answers it with a redirect home (apps/web/nginx.conf). Change the path there too if it moves.
 * The same denylist excludes `/cdn-cgi/`, where Access lands the browser after the PIN to set its
 * cookie; if the service worker answered that from cache, this re-login would loop.
 *
 * `<img>` requests to `/api` cannot carry the header that makes Access answer with a 401, so an
 * expired Access session shows up as a broken receipt image until the next SDK call triggers this.
 * That is accepted, not an oversight.
 */
export const EDGE_REAUTH_PATH = '/api/auth/reauth';

/** sessionStorage key holding when the last re-login navigation started (epoch ms). */
const LAST_ATTEMPT_KEY = 'budget-tools:edge-reauth-at';

/**
 * A second edge 401 this soon after a re-login means the navigation did not fix it: the response
 * came from something other than an expired Access session (a misconfiguration at the edge, say).
 * Navigating again would loop forever, so the caller falls back to the app's signed-out state.
 */
export const EDGE_REAUTH_RETRY_WINDOW_MS = 30_000;

export function shouldStartEdgeReauth(lastAttemptAt: number | undefined, now: number): boolean {
    return lastAttemptAt === undefined || now - lastAttemptAt >= EDGE_REAUTH_RETRY_WINDOW_MS;
}

function readLastAttempt(): number | undefined {
    const raw = window.sessionStorage.getItem(LAST_ATTEMPT_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Sends the browser through Cloudflare's login. Returns false, and does nothing, when a re-login
 * was already attempted within the retry window.
 */
export function startEdgeReauth(): boolean {
    const now = Date.now();
    if (!shouldStartEdgeReauth(readLastAttempt(), now)) {
        return false;
    }
    window.sessionStorage.setItem(LAST_ATTEMPT_KEY, String(now));
    window.location.assign(EDGE_REAUTH_PATH);
    return true;
}
