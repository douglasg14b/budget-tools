import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * When set, ML scoring uses the warm categorization-ai HTTP scorer instead of spawning predict-json.
 */
export function getCategorizationScorerUrl(): string | undefined {
    const value = env.get('CATEGORIZATION_SCORER_URL').default('').asString().trim();
    return value || undefined;
}

/**
 * Postgres connection string. Read lazily so OpenAPI generation can load the process without a database.
 */
export function getDbConnectionString(): string {
    return env.get('DB_CONNECTION_STRING').required().asString();
}

/**
 * API-owned SQLite file for app config (travel windows, Amazon order cache). Not the Budget Tools Postgres schema.
 */
export function getSqliteDbPath(): string {
    return resolveFromCwd(env.get('SQLITE_DB_PATH').default('apps/api/data/app.sqlite').asString());
}

/**
 * Path to the Amazon order-history MCP `dist/index.js`.
 * Optional so OpenAPI generation can load without it. Sync fails loud (503) when unset.
 * Produce the clone with `pnpm setup:amazon-mcp`.
 */
export function getAmazonOrdersMcpEntry(): string | undefined {
    const value = env.get('AMAZON_ORDERS_MCP_ENTRY').default('').asString().trim();
    return value ? resolveFromRepoRoot(value) : undefined;
}

export const AMAZON_ORDERS_REGION = env.get('AMAZON_ORDERS_REGION').default('us').asString();

export const AMAZON_ORDERS_SYNC_TIMEOUT_MS = env.get('AMAZON_ORDERS_SYNC_TIMEOUT_MS').default('600000').asIntPositive();

export const YNAB_FLUSH_BATCH_SIZE = env.get('YNAB_FLUSH_BATCH_SIZE').default('25').asIntPositive();

export const YNAB_FLUSH_INTERVAL_MS = env.get('YNAB_FLUSH_INTERVAL_MS').default('300000').asIntPositive();

export const YNAB_FLUSH_MIN_INTERVAL_MS = env.get('YNAB_FLUSH_MIN_INTERVAL_MS').default('30000').asIntPositive();

/**
 * YNAB personal access token. Optional so OpenAPI generation can load without secrets.
 * Live enqueue succeeds without it; flush fails loud when this is empty.
 */
export function getYnabApiKey(): string | undefined {
    const value = env.get('YNAB_API_KEY').default('').asString().trim();
    return value || undefined;
}

/**
 * YNAB budget display name. Optional so OpenAPI generation can load without secrets.
 */
export function getYnabBudgetName(): string | undefined {
    const value = env.get('YNAB_BUDGET_NAME').default('').asString().trim();
    return value || undefined;
}

function resolveFromCwd(value: string): string {
    return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

/** `pnpm setup:amazon-mcp` writes a path relative to the repo root, not the API cwd. */
function resolveFromRepoRoot(value: string): string {
    if (isAbsolute(value)) {
        return value;
    }
    const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
    return resolve(repoRoot, value);
}
