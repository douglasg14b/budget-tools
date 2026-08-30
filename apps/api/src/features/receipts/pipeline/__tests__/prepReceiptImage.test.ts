import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { jpegDataUrl, prepReceiptImage, RECEIPT_PREP_MAX_WIDTH } from '../prepReceiptImage';

async function solidJpeg(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: color },
    })
        .jpeg()
        .toBuffer();
}

describe('prepReceiptImage', () => {
    it('downsamples a wide frame to the max width', async () => {
        const original = await solidJpeg(2000, 100, { r: 40, g: 40, b: 40 });
        const processed = await prepReceiptImage({ frames: [original] });
        const meta = await sharp(processed).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.width).toBe(RECEIPT_PREP_MAX_WIDTH);
    });

    it('stitches two frames vertically into one jpeg', async () => {
        const top = await solidJpeg(100, 40, { r: 10, g: 10, b: 10 });
        const bottom = await solidJpeg(100, 30, { r: 200, g: 200, b: 200 });
        const processed = await prepReceiptImage({ frames: [top, bottom], maxWidth: 100 });
        const meta = await sharp(processed).metadata();
        expect(meta.width).toBe(100);
        expect(meta.height).toBe(70);
    });

    it('rejects an empty frame list', async () => {
        await expect(prepReceiptImage({ frames: [] })).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('jpegDataUrl', () => {
    it('encodes jpeg bytes as a data URL', () => {
        const bytes = Buffer.from([0xff, 0xd8, 0xff]);
        expect(jpegDataUrl(bytes)).toBe(`data:image/jpeg;base64,${bytes.toString('base64')}`);
    });
});
