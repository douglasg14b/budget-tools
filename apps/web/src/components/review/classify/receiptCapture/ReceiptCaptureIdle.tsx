import { Button } from '@mantine/core';
import { useRef } from 'react';

import type { ReceiptCaptureState } from '../useReceiptCapture';
import classes from './ReceiptCaptureIdle.module.css';

type ReceiptCaptureIdleProps = {
    readonly capture: ReceiptCaptureState;
    readonly submitLabel: string;
};

/**
 * Compact capture controls on the classify card or inbox. Full-screen camera and review sit beside this.
 */
export function ReceiptCaptureIdle({ capture, submitLabel }: ReceiptCaptureIdleProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const ready = capture.draftStatus === 'ready' && capture.session === 'idle';

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
            {ready && capture.processedPreview ? (
                <img alt="Cropped receipt preview" className={classes.still} src={capture.processedPreview} />
            ) : null}
            {ready ? (
                <p className={classes.draft}>
                    Cropped preview
                    <Button size="compact-sm" variant="default" onClick={capture.adjustCorners}>
                        Adjust corners
                    </Button>
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
            {capture.error && capture.session === 'idle' ? <p className={classes.error}>{capture.error}</p> : null}
        </div>
    );
}
