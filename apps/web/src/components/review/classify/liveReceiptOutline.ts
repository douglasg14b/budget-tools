import type { ReceiptScanCorners } from './scanicReceiptPrep';

export const LIVE_RECEIPT_OUTLINE_MS = 200;

export type LiveReceiptOutline = {
    readonly corners: ReceiptScanCorners;
    readonly height: number;
    readonly width: number;
};

/**
 * SVG polygon points in 0–100 space so the overlay matches a cover-cropped viewfinder.
 */
export function liveOutlinePolygonPoints(outline: LiveReceiptOutline): string {
    const { corners, width, height } = outline;
    if (width <= 0 || height <= 0) {
        return '';
    }
    return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
        .map((point) => `${(point.x / width) * 100},${(point.y / height) * 100}`)
        .join(' ');
}
