import { HttpError } from '../travelWindows/HttpError';

/** Maximum stitched receipt photos accepted on create and extract-preview. */
export const MAX_RECEIPT_FRAMES = 8;

/**
 * Throws 400 when the frame list exceeds {@link MAX_RECEIPT_FRAMES}.
 */
export function assertReceiptFrameCountWithinLimit(frameCount: number): void {
    if (frameCount > MAX_RECEIPT_FRAMES) {
        throw new HttpError(400, `Receipt allows at most ${MAX_RECEIPT_FRAMES} frames`);
    }
}
