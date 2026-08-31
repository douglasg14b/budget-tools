import { Button } from '@mantine/core';
import { useRef } from 'react';

import classes from './ClassifyReceiptCapture.module.css';
import type { ReceiptCaptureState } from './useReceiptCapture';
import { MAX_RECEIPT_FRAMES } from './useReceiptCapture';

type ClassifyReceiptCaptureProps = {
    capture: ReceiptCaptureState;
};

export function ClassifyReceiptCapture({ capture }: ClassifyReceiptCaptureProps) {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div className={classes.row}>
            <input
                ref={fileRef}
                accept="image/*"
                className={classes.file}
                multiple
                type="file"
                onChange={(event) => {
                    const files = event.target.files ? [...event.target.files] : [];
                    if (files.length > 0) {
                        void capture.pickFiles(files);
                    }
                    event.target.value = '';
                }}
            />
            {capture.cameraOpen ? (
                <div className={classes.camera}>
                    <video ref={capture.videoRef} autoPlay className={classes.preview} muted playsInline />
                    <div className={classes.actions}>
                        <Button size="compact-sm" onClick={() => void capture.snap()}>
                            Snap
                        </Button>
                        <Button size="compact-sm" variant="default" onClick={capture.closeCamera}>
                            Close camera
                        </Button>
                    </div>
                </div>
            ) : (
                <div className={classes.actions}>
                    <Button
                        size="compact-sm"
                        variant="default"
                        onClick={() => {
                            fileRef.current?.click();
                        }}
                    >
                        Upload photo
                    </Button>
                    {capture.cameraSupported ? (
                        <Button size="compact-sm" variant="default" onClick={() => void capture.openCamera()}>
                            Take photo
                        </Button>
                    ) : null}
                </div>
            )}
            {capture.draftCount > 0 ? (
                <p className={classes.draft}>
                    {capture.draftCount} of {MAX_RECEIPT_FRAMES} frames
                    <Button
                        className={classes.attach}
                        loading={capture.submitting}
                        size="compact-sm"
                        onClick={capture.attach}
                    >
                        Attach receipt
                    </Button>
                    <Button size="compact-sm" variant="subtle" onClick={capture.discardDraft}>
                        Discard
                    </Button>
                </p>
            ) : null}
            {capture.error ? <p className={classes.error}>{capture.error}</p> : null}
        </div>
    );
}
