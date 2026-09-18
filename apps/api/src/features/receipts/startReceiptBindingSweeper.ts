import { RECEIPT_BIND_SWEEP_INTERVAL_MS } from '../../environment';
import { sweepUnboundReceiptBindings } from './sweepUnboundReceiptBindings';

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts a guarded Live binding retry on boot and at a bounded interval. */
export function startReceiptBindingSweeper(): void {
    if (timer) {
        return;
    }
    void sweepSafely();
    timer = setInterval(() => {
        void sweepSafely();
    }, RECEIPT_BIND_SWEEP_INTERVAL_MS);
    timer.unref?.();
}

export function stopReceiptBindingSweeper(): void {
    if (!timer) {
        return;
    }
    clearInterval(timer);
    timer = undefined;
}

async function sweepSafely(): Promise<void> {
    try {
        const bound = await sweepUnboundReceiptBindings();
        if (bound > 0) {
            console.log(`Auto-bound ${bound} receipt(s)`);
        }
    } catch (error) {
        console.error('Receipt binding sweep failed', error);
    }
}
