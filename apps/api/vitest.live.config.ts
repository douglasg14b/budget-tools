import { defineConfig } from 'vitest/config';

/**
 * `pnpm test:live`: only `*.live.test.ts`, which call OpenRouter for real. Run explicitly,
 * never as part of `pnpm test`.
 */
// biome-ignore lint/style/noDefaultExport: Vitest expects a default export from this config file.
export default defineConfig({
    test: {
        include: ['src/**/*.live.test.ts'],
        setupFiles: ['./vitest.live.setup.ts'],
    },
});
