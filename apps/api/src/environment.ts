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

export const CATEGORIZATION_QUEUE_BATCH_SIZE = env.get('CATEGORIZATION_QUEUE_BATCH_SIZE').default('50').asIntPositive();

export const OPENROUTER_MODEL = env.get('OPENROUTER_MODEL').default('qwen/qwen3.7-flash').asString();

export const OPENROUTER_BASE_URL = env.get('OPENROUTER_BASE_URL').default('https://openrouter.ai/api/v1').asString();

/**
 * OpenRouter key. Optional so OpenAPI generation can load without secrets.
 * The LLM suggest endpoint fails loud when this is empty.
 */
export function getOpenRouterApiKey(): string | undefined {
    const value = env.get('OPENROUTER_API_KEY').default('').asString().trim();
    return value || undefined;
}

export const CATEGORIZATION_QUEUE_CACHE_DIR = resolveFromCwd(
    env.get('CATEGORIZATION_QUEUE_CACHE_DIR').default('apps/api/.cache/categorization-queue').asString(),
);

/**
 * Postgres connection string. Read lazily so OpenAPI generation can load the process without a database.
 */
export function getDbConnectionString(): string {
    return env.get('DB_CONNECTION_STRING').required().asString();
}

/**
 * API-owned SQLite file for app config (travel windows, bias). Not the Budget Tools Postgres schema.
 */
export function getSqliteDbPath(): string {
    return resolveFromCwd(env.get('SQLITE_DB_PATH').default('apps/api/data/app.sqlite').asString());
}

function resolveFromCwd(value: string): string {
    return isAbsolute(value) ? value : resolve(process.cwd(), value);
}
