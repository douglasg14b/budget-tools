import { Button } from '@mantine/core';

import type { ReceiptCaptureState } from '../useReceiptCapture';
import classes from './ReceiptCaptureReview.module.css';
import { ReceiptCaptureSession } from './ReceiptCaptureSession';

type ReceiptCaptureReviewProps = {
    readonly capture: ReceiptCaptureState;
    readonly submitLabel: string;
};

/**
 * Original still with a draggable receipt quad. Submit warps and saves; retake reopens the camera.
 */
export function ReceiptCaptureReview({ capture, submitLabel }: ReceiptCaptureReviewProps) {
    const preparing = capture.draftStatus === 'preparing';
    const busy = preparing || capture.confirming || capture.submitting;

    return (
        <ReceiptCaptureSession
            error={capture.error}
            label="Confirm receipt edges"
            status={reviewStatus(preparing, capture.submitting)}
            actions={
                <div className={classes.actions}>
                    <Button disabled={busy} size="md" variant="default" onClick={capture.cancelSession}>
                        Cancel
                    </Button>
                    {capture.cameraSupported ? (
                        <Button disabled={busy} size="md" variant="default" onClick={capture.retake}>
                            Retake
                        </Button>
                    ) : null}
                    <Button
                        disabled={preparing}
                        loading={capture.confirming || capture.submitting}
                        size="md"
                        onClick={capture.confirmReview}
                    >
                        {submitLabel}
                    </Button>
                </div>
            }
            stage={
                <>
                    {capture.originalPreview && !capture.cornerEditorOpen ? (
                        <img
                            alt=""
                            className={classes.still}
                            src={capture.processedPreview ?? capture.originalPreview}
                        />
                    ) : null}
                    <div
                        ref={capture.cornerHostRef}
                        className={classes.cornerHost}
                        hidden={!capture.cornerEditorOpen}
                    />
                </>
            }
        />
    );
}

function reviewStatus(preparing: boolean, submitting: boolean): string {
    if (preparing) {
        return 'Finding the paper edges…';
    }
    if (submitting) {
        return 'Saving…';
    }
    return 'Drag the corners onto the paper, then submit.';
}
