import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { NewInferenceCall } from './inferenceCallsSchema';

export async function insertInferenceCall(call: NewInferenceCall, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await database.insertInto('inference_calls').values(call).execute();
}
