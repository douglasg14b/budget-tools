import sharp from 'sharp';

/** About 3x the inbox slip's 4.6rem image column, so it stays sharp on phone screens. */
export const RECEIPT_THUMB_WIDTH = 240;

/**
 * Small JPEG for the receipts list. `rotate()` applies EXIF orientation the way browsers do
 * when they show the full image.
 */
export async function renderReceiptThumb(bytes: Buffer): Promise<Buffer> {
    return sharp(bytes)
        .rotate()
        .resize({ width: RECEIPT_THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
}
