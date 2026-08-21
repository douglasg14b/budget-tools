import type { SetupClientOptions } from '@budget-tools/web-sdk';
import { setupClient } from '@budget-tools/web-sdk';

export function configureApiClient(): void {
    const options: SetupClientOptions = {
        baseUrl: '/api',
        auth: async () => undefined,
    };

    setupClient(options);
}
