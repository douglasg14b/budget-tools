import { describe, expect, it } from 'vitest';

import { liveOutlinePolygonPoints } from '../liveReceiptOutline';

describe('liveOutlinePolygonPoints', () => {
    it('maps cover-crop pixels into a 0–100 SVG polygon', () => {
        expect(
            liveOutlinePolygonPoints({
                width: 100,
                height: 200,
                corners: {
                    topLeft: { x: 10, y: 20 },
                    topRight: { x: 90, y: 20 },
                    bottomRight: { x: 90, y: 180 },
                    bottomLeft: { x: 10, y: 180 },
                },
            }),
        ).toBe('10,10 90,10 90,90 10,90');
    });

    it('returns empty when the still has no size', () => {
        expect(
            liveOutlinePolygonPoints({
                width: 0,
                height: 200,
                corners: {
                    topLeft: { x: 0, y: 0 },
                    topRight: { x: 1, y: 0 },
                    bottomRight: { x: 1, y: 1 },
                    bottomLeft: { x: 0, y: 1 },
                },
            }),
        ).toBe('');
    });
});
