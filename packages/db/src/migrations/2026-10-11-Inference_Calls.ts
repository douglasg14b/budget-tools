import type { Kysely } from 'kysely';
import { sql } from 'kysely';

/**
 * One row per OpenRouter request, written by the API's single OpenRouter transport
 * (`features/inference/callOpenRouter.ts`). Holds what the call cost, never what was sent or
 * returned.
 *
 * - `purpose`: what the call was for (`InferencePurpose` in the API). Plain text so a new
 *   purpose needs no migration; the API's type is the enum.
 * - `model`: the model requested. `response_model` / `provider`: what OpenRouter routed to.
 * - `outcome`: `ok`, or how the request failed. Failed and timed-out calls are kept because
 *   OpenRouter can still bill them; `generation_id` reconciles a row against OpenRouter's logs.
 * - Token counts and `cost_usd` are as OpenRouter reported them, null when it reported none.
 *   `completion_tokens` already includes `reasoning_tokens`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable('inference_calls')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('called_at', sql`timestamptz`, (col) => col.notNull())
        .addColumn('purpose', 'text', (col) => col.notNull())
        .addColumn('model', 'text', (col) => col.notNull())
        .addColumn('response_model', 'text')
        .addColumn('provider', 'text')
        .addColumn('generation_id', 'text')
        .addColumn('outcome', 'text', (col) => col.notNull())
        .addColumn('http_status', 'integer')
        .addColumn('duration_ms', 'integer', (col) => col.notNull())
        .addColumn('prompt_tokens', 'integer')
        .addColumn('completion_tokens', 'integer')
        .addColumn('reasoning_tokens', 'integer')
        .addColumn('cached_tokens', 'integer')
        .addColumn('cost_usd', 'double precision')
        .execute();
    await db.schema
        .createIndex('inference_calls_called_at_idx')
        .ifNotExists()
        .on('inference_calls')
        .column('called_at')
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('inference_calls').ifExists().execute();
}
