import { Button } from '@mantine/core';
import { useRef } from 'react';

import classes from './ClassifyReceiptCapture.module.css';
import type { ReceiptCaptureDraft } from './receiptCaptureDraft';
import type { ReceiptCaptureState } from './useReceiptCapture';

type ClassifyReceiptCaptureProps = {
    capture: ReceiptCaptureState;
    submitLabel?: string;
};

export function ClassifyReceiptCapture({ capture, submitLabel = 'Attach receipt' }: ClassifyReceiptCaptureProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const showEditor = capture.cornerEditorOpen;
    const showProcessed = capture.draftStatus === 'ready' && !capture.cornerEditorOpen && capture.processedPreview;
    const showOriginal = capture.draftStatus === 'preparing' && capture.originalPreview;

    return (
        <div className={classes.row}>
            <input
                ref={fileRef}
                accept="image/*"
                className={classes.file}
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
            {showOriginal ? <img alt="" className={classes.still} src={capture.originalPreview ?? undefined} /> : null}
            {showProcessed ? (
                <img
                    alt="Cropped receipt preview"
                    className={classes.still}
                    src={capture.processedPreview ?? undefined}
                />
            ) : null}
            <div ref={capture.cornerHostRef} className={classes.cornerHost} hidden={!showEditor} />
            {capture.draftStatus !== 'empty' ? (
                <p className={classes.draft}>
                    {draftStatusCopy(capture.draftStatus)}
                    {capture.draftStatus === 'ready' && !capture.cornerEditorOpen ? (
                        <Button size="compact-sm" variant="default" onClick={capture.adjustCorners}>
                            Adjust corners
                        </Button>
                    ) : null}
                    <Button
                        className={classes.attach}
                        disabled={!capture.canAttach}
                        loading={capture.submitting}
                        size="compact-sm"
                        onClick={capture.attach}
                    >
                        {submitLabel}
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

function draftStatusCopy(status: ReceiptCaptureDraft['status']): string {
    switch (status) {
        case 'preparing':
            return 'Finding the paper edges…';
        case 'ready':
            return 'Cropped preview';
        case 'needs-corners':
            return 'Set the four corners on the paper';
        case 'empty':
            return '';
    }
}
