import { Categorization, getOutboundSyncQueryKey } from '@budget-tools/web-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import { CLASSIFY_QUEUE_QUERY_KEY } from '../useClassifyQueue';
import { liveDecisionPayload } from './liveDecisionPayload';
import type { PayeeEdits } from './payeeEdits';
import type { SessionDecision } from './sessionDecisions';

export type LiveClassification = {
    persist: (decisions: readonly SessionDecision[], payeeEdits: PayeeEdits) => Promise<void>;
    retract: (decision: SessionDecision) => Promise<void>;
};

/**
 * Live-mode persistence for classify decisions. Practice callers receive undefined.
 */
export function useLiveClassification(enabled: boolean): LiveClassification | undefined {
    const queryClient = useQueryClient();
    const lock = useRef(Promise.resolve());

    const runExclusive = useCallback(async (work: () => Promise<void>): Promise<void> => {
        const previous = lock.current;
        let release = (): void => undefined;
        lock.current = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            await work();
        } finally {
            release();
        }
    }, []);

    const persist = useCallback(
        async (decisions: readonly SessionDecision[], payeeEdits: PayeeEdits): Promise<void> => {
            const payload = decisions.flatMap((decision) => {
                const body = liveDecisionPayload(decision, payeeEdits.names[decision.transactionId]);
                return body ? [body] : [];
            });
            if (payload.length === 0) {
                return;
            }
            await runExclusive(async () => {
                await Categorization.request5({ body: { decisions: payload }, throwOnError: true });
                await queryClient.invalidateQueries({ queryKey: CLASSIFY_QUEUE_QUERY_KEY });
                await queryClient.invalidateQueries({ queryKey: getOutboundSyncQueryKey() });
            });
        },
        [queryClient, runExclusive],
    );

    const retract = useCallback(
        async (decision: SessionDecision): Promise<void> => {
            if (!liveDecisionPayload(decision, undefined)) {
                return;
            }
            await runExclusive(async () => {
                await Categorization.request6({
                    path: { transactionId: decision.transactionId },
                    throwOnError: true,
                });
                await queryClient.invalidateQueries({ queryKey: CLASSIFY_QUEUE_QUERY_KEY });
                await queryClient.invalidateQueries({ queryKey: getOutboundSyncQueryKey() });
            });
        },
        [queryClient, runExclusive],
    );

    if (!enabled) {
        return undefined;
    }
    return { persist, retract };
}

export function liveClassificationErrorMessage(error: unknown): string {
    return getBackendErrorMessage(error, 'Could not save that classification to the YNAB queue.');
}
