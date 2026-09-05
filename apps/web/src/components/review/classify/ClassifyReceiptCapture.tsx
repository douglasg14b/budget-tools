import { ReceiptCaptureCamera } from './receiptCapture/ReceiptCaptureCamera';
import { ReceiptCaptureIdle } from './receiptCapture/ReceiptCaptureIdle';
import { ReceiptCaptureReview } from './receiptCapture/ReceiptCaptureReview';
import type { ReceiptCaptureState } from './useReceiptCapture';

type ClassifyReceiptCaptureProps = {
    capture: ReceiptCaptureState;
    submitLabel?: string;
};

/**
 * Idle picker, full-screen camera, and corner review. Each mode is its own component.
 */
export function ClassifyReceiptCapture({ capture, submitLabel = 'Attach receipt' }: ClassifyReceiptCaptureProps) {
    return (
        <>
            <ReceiptCaptureIdle capture={capture} submitLabel={submitLabel} />
            {capture.session === 'camera' ? <ReceiptCaptureCamera capture={capture} /> : null}
            {capture.session === 'review' ? <ReceiptCaptureReview capture={capture} submitLabel={submitLabel} /> : null}
        </>
    );
}
