import type { SetupClientOptions } from '@budget-tools/web-sdk';
import { setupClient } from '@budget-tools/web-sdk';

import { startEdgeReauth } from './auth/edgeSession';
import { notifyUnauthorized } from './auth/unauthorizedListener';

export function configureApiClient(): void {
    const options: SetupClientOptions = {
        // The session is an HttpOnly cookie the browser attaches itself, so there is no bearer
        // token for the client to supply; `credentials: 'same-origin'` (the SDK default) is what
        // actually authenticates requests.
        auth: async () => undefined,
        baseUrl: '/api',
        // This runs before React mounts, so the 401 signal is handed to a module-level notifier
        // that `AuthProvider` subscribes to once it exists. See ./auth/unauthorizedListener.
        onUnauthorized: notifyUnauthorized,
        // Cloudflare Access's session lapsed on the public hostname. Go back through its login;
        // if that was just tried and did not help, show the app's own signed-out state instead
        // of navigating in a loop. See ./auth/edgeSession.
        onEdgeSessionExpired: () => {
            if (!startEdgeReauth()) {
                console.warn('Cloudflare Access still refuses requests after a re-login; showing sign-in.');
                notifyUnauthorized();
            }
        },
    };

    setupClient(options);
}
