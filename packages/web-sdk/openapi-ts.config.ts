import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRepoRoot } from '@budget-tools/shared-node';
import { defineConfig } from '@hey-api/openapi-ts';

const packageDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = findRepoRoot(packageDir);
const openApiPath = path.join(repoRoot, 'apps', 'api', 'generated', 'openapi.generated.json');

// openapi-ts requires a default export config.
// biome-ignore lint/style/noDefaultExport: required by openapi-ts.
export default defineConfig({
    input: openApiPath,
    output: 'src/gen',
    plugins: [
        '@hey-api/client-fetch',
        {
            name: '@hey-api/sdk',
            asClass: true,
            methodNameBuilder: (operation) => toCamelCase(operation.summary ?? operation.name ?? 'request'),
            serviceNameBuilder: (name) => name.charAt(0).toLowerCase() + name.slice(1).replace(/Service$/, ''),
        },
        {
            name: '@tanstack/react-query',
            queryOptions: true,
            mutationOptions: true,
        },
    ],
});

function toCamelCase(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
}
