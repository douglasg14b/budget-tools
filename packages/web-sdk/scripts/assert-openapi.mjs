import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const openApiPath = path.join(packageDir, '..', '..', 'apps', 'api', 'generated', 'openapi.generated.json');

if (!existsSync(openApiPath)) {
    throw new Error(
        `Missing OpenAPI artifact at ${openApiPath}. Run "pnpm --filter @budget-tools/api tsoa" or "pnpm --filter @budget-tools/api build" first.`,
    );
}
