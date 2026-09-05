import { describe, expect, it } from 'vitest';

import { videoCoverCrop } from '../videoCoverCrop';

describe('videoCoverCrop', () => {
    it('crops the sides of a landscape stream shown in a portrait viewfinder', () => {
        const crop = videoCoverCrop({
            videoWidth: 1920,
            videoHeight: 1080,
            displayWidth: 390,
            displayHeight: 844,
        });
        expect(crop.sourceY).toBe(0);
        expect(crop.sourceHeight).toBe(1080);
        expect(crop.sourceWidth).toBeCloseTo(1080 * (390 / 844));
        expect(crop.sourceX).toBeCloseTo((1920 - crop.sourceWidth) / 2);
    });

    it('crops the top and bottom of a portrait stream shown in a landscape viewfinder', () => {
        const crop = videoCoverCrop({
            videoWidth: 1080,
            videoHeight: 1920,
            displayWidth: 844,
            displayHeight: 390,
        });
        expect(crop.sourceX).toBe(0);
        expect(crop.sourceWidth).toBe(1080);
        expect(crop.sourceHeight).toBeCloseTo(1080 / (844 / 390));
        expect(crop.sourceY).toBeCloseTo((1920 - crop.sourceHeight) / 2);
    });

    it('keeps the full frame when the viewfinder matches the stream', () => {
        expect(
            videoCoverCrop({
                videoWidth: 1920,
                videoHeight: 1080,
                displayWidth: 1280,
                displayHeight: 720,
            }),
        ).toEqual({
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 1920,
            sourceHeight: 1080,
        });
    });

    it('falls back to the full frame when the video element has no layout yet', () => {
        expect(
            videoCoverCrop({
                videoWidth: 1920,
                videoHeight: 1080,
                displayWidth: 0,
                displayHeight: 0,
            }),
        ).toEqual({
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 1920,
            sourceHeight: 1080,
        });
    });
});
