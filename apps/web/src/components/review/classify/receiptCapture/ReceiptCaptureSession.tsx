import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import classes from './ReceiptCaptureSession.module.css';

type ReceiptCaptureSessionProps = {
    readonly label: string;
    readonly status: string;
    readonly error: string | null;
    readonly stage: ReactNode;
    readonly actions: ReactNode;
};

/**
 * Full-screen capture chrome. Camera and review supply the stage and actions.
 */
export function ReceiptCaptureSession({ label, status, error, stage, actions }: ReceiptCaptureSessionProps) {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return createPortal(
        <div aria-label={label} aria-modal="true" className={classes.session} role="dialog">
            <div className={classes.stage}>{stage}</div>
            <div className={classes.bar}>
                <p className={classes.status}>{status}</p>
                {error ? <p className={classes.error}>{error}</p> : null}
                {actions}
            </div>
        </div>,
        document.body,
    );
}
