import { Button } from '@mantine/core';

import type { ReceiptCaptureState } from '../useReceiptCapture';
import classes from './ReceiptCaptureCamera.module.css';
import { ReceiptCaptureLiveOutline } from './ReceiptCaptureLiveOutline';
import { ReceiptCaptureSession } from './ReceiptCaptureSession';

type ReceiptCaptureCameraProps = {
    readonly capture: ReceiptCaptureState;
};

/**
 * Live viewfinder and shutter. Snapping closes this and opens review.
 */
export function ReceiptCaptureCamera({ capture }: ReceiptCaptureCameraProps) {
    return (
        <ReceiptCaptureSession
            error={capture.error}
            label="Take receipt photo"
            status={cameraStatus(capture.cameraReady, capture.snapping)}
            actions={
                <div className={classes.actions}>
                    <Button className={classes.side} size="md" variant="default" onClick={capture.cancelSession}>
                        Cancel
                    </Button>
                    <button
                        aria-label="Snap photo"
                        className={classes.snap}
                        disabled={!capture.cameraReady || capture.snapping}
                        type="button"
                        onClick={() => void capture.snap()}
                    />
                    <span className={classes.side} />
                </div>
            }
            stage={
                <div className={classes.viewfinder}>
                    <video ref={capture.videoRef} autoPlay className={classes.live} muted playsInline />
                    {capture.liveOutline ? <ReceiptCaptureLiveOutline outline={capture.liveOutline} /> : null}
                </div>
            }
        />
    );
}

function cameraStatus(ready: boolean, snapping: boolean): string {
    if (!ready) {
        return 'Starting camera…';
    }
    if (snapping) {
        return 'Taking photo…';
    }
    return 'Fill the frame with the tape, then snap.';
}
