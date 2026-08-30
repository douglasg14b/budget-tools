import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { renderAmazonReceiptPng, renderCafeReceiptPng } from './renderReceiptFixture';

describe('renderReceiptFixture', () => {
    it('rasterizes cafe and Amazon receipts as PNGs with interior ink', async () => {
        const cafe = await renderCafeReceiptPng();
        const amazon = await renderAmazonReceiptPng();
        for (const png of [cafe, amazon]) {
            const meta = await sharp(png).metadata();
            expect(meta.format).toBe('png');
            expect(meta.width).toBeGreaterThanOrEqual(700);
            const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
            let darkPixels = 0;
            for (const value of data) {
                if (value < 200) {
                    darkPixels += 1;
                }
            }
            expect(darkPixels).toBeGreaterThan(800);
        }
    });
});
