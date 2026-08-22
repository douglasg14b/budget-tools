import { isAbsolute, resolve } from 'node:path';

import env from 'env-var';

export const API_PORT = env.get('API_PORT').default('4020').asPortNumber();

export const CATEGORIZATION_AI_WORKING_DIR = resolveFromCwd(
    env.get('CATEGORIZATION_AI_WORKING_DIR').default('apps/categorization-ai').asString(),
);

export const CATEGORIZATION_MODELS_DIR = resolveFromCwd(
    env.get('CATEGORIZATION_MODELS_DIR').default('models').asString(),
);

export const CATEGORIZATION_PREDICT_TIMEOUT_MS = env
    .get('CATEGORIZATION_PREDICT_TIMEOUT_MS')
    .default('300000')
    .asIntPositive();

export const CATEGORIZATION_LLM_ENABLED = env.get('CATEGORIZATION_LLM_ENABLED').default('false').asBool();

/**
 * Postgres connection string. Read lazily so OpenAPI generation can load the process without a database.
 */
export function getDbConnectionString(): string {
    return env.get('DB_CONNECTION_STRING').required().asString();
}

function resolveFromCwd(value: string): string {
    return isAbsolute(value) ? value : resolve(process.cwd(), value);
}
