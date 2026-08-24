import { defineConfig } from 'vitest/config';

// biome-ignore lint/style/noDefaultExport: Vitest expects a default export from this config file.
export default defineConfig({
    test: {
        environment: 'node',
    },
});
