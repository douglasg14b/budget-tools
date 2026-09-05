import type { LiveReceiptOutline } from '../liveReceiptOutline';
import { liveOutlinePolygonPoints } from '../liveReceiptOutline';
import classes from './ReceiptCaptureLiveOutline.module.css';

type ReceiptCaptureLiveOutlineProps = {
    readonly outline: LiveReceiptOutline;
};

/**
 * Quad overlay on the live viewfinder. Pointers pass through to the shutter.
 */
export function ReceiptCaptureLiveOutline({ outline }: ReceiptCaptureLiveOutlineProps) {
    const points = liveOutlinePolygonPoints(outline);
    if (!points) {
        return null;
    }
    return (
        <svg aria-hidden="true" className={classes.overlay} preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon className={classes.quad} points={points} />
        </svg>
    );
}
