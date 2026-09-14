import type { SetupClientOptions } from '@budget-tools/web-sdk';
import { setupClient } from '@budget-tools/web-sdk';

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
    };

    setupClient(options);
}
