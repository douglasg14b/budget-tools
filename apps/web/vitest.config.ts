import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { defineConfig } from 'vitest/config';

/** The committed, secret-free test environment. `.env.local` is production and is never loaded here. */
const testEnv = parseEnv(readFileSync(new URL('../../.env.test', import.meta.url), 'utf8')) as Record<string, string>;

// biome-ignore lint/style/noDefaultExport: Vitest expects a default export from this config file.
export default defineConfig({
    test: {
        environment: 'node',
        env: testEnv,
        setupFiles: ['./vitest.setup.ts'],
    },
});
