import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { configDefaults, defineConfig } from 'vitest/config';

/** The committed, secret-free test environment. `.env.local` is production and is never loaded here. */
const testEnv = parseEnv(readFileSync(new URL('../../.env.test', import.meta.url), 'utf8')) as Record<string, string>;

// biome-ignore lint/style/noDefaultExport: Vitest expects a default export from this config file.
export default defineConfig({
    test: {
        passWithNoTests: true,
        env: testEnv,
        setupFiles: ['./vitest.setup.ts'],
        // Live tests call paid remote APIs; they run only through `pnpm test:live`.
        exclude: [...configDefaults.exclude, '**/*.live.test.ts'],
    },
});
