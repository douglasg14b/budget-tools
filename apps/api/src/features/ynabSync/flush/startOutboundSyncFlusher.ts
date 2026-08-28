import { YNAB_FLUSH_BATCH_SIZE, YNAB_FLUSH_INTERVAL_MS } from '../../../environment';
import { resumeStaleSyncing } from '../data/classificationSyncRepo';
import { flushOutboundSync, setOutboundFlushTrigger } from './flushOutboundSync';

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Resumes stale syncing rows and flushes on an interval plus count threshold.
 */
export function startOutboundSyncFlusher(): void {
    if (timer) {
        return;
    }
    void resumeAndFlush();
    timer = setInterval(() => {
        void flushSafely();
    }, YNAB_FLUSH_INTERVAL_MS);
    timer.unref?.();
    setOutboundFlushTrigger((pendingCount) => {
        if (pendingCount >= YNAB_FLUSH_BATCH_SIZE) {
            void flushSafely();
        }
    });
}

export function stopOutboundSyncFlusher(): void {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
    setOutboundFlushTrigger(undefined);
}

async function resumeAndFlush(): Promise<void> {
    await resumeStaleSyncing();
    await flushSafely();
}

async function flushSafely(): Promise<void> {
    try {
        await flushOutboundSync();
    } catch (error) {
        console.error('Outbound YNAB flush failed', error);
    }
}
