import { insertInferenceCall } from './data/inferenceCallsRepo';
import type { NewInferenceCall } from './data/inferenceCallsSchema';

export type InferenceCallRecorder = (call: NewInferenceCall) => Promise<void>;

let recorder: InferenceCallRecorder = (call) => insertInferenceCall(call);

/**
 * Writes one row to the inference ledger. Never throws: a ledger outage must not fail the
 * receipt extract or suggestion that paid for the call.
 */
export async function recordInferenceCall(call: NewInferenceCall): Promise<void> {
    try {
        await recorder(call);
    } catch (error) {
        console.warn('inference call not recorded', {
            purpose: call.purpose,
            model: call.model,
            costUsd: call.costUsd ?? null,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/** Swaps the recorder for tests that exercise the transport without a database; `undefined` restores it. */
export function setInferenceCallRecorderForTests(next: InferenceCallRecorder | undefined): void {
    recorder = next ?? ((call) => insertInferenceCall(call));
}
