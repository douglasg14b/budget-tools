import type { Auth } from '@hey-api/client-fetch';

import { client } from './gen/client.gen';

export type SetupClientOptions = {
    baseUrl: string;
    headers?: Record<string, string>;
    auth: (auth: Auth) => Promise<string | undefined> | string | undefined;
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

export function setupClient({ baseUrl, headers, auth }: SetupClientOptions): void {
    client.setConfig({
        baseUrl,
        headers,
        auth,
    });
    isSetupComplete = true;
}
