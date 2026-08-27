import { describe, expect, it } from 'vitest';

import { allocateAmazonItemsToBank } from '../allocateAmazonItemsToBank';

describe('allocateAmazonItemsToBank', () => {
    it('nets a Subscribe & Save list price onto the charged amount', () => {
        const billed = allocateAmazonItemsToBank([{ title: 'SAFESKIN gloves', itemTotalMilliunits: 46990 }], -39940);
        expect(billed).toEqual([{ title: 'SAFESKIN gloves', itemTotalMilliunits: -39940 }]);
        expect(billed.reduce((sum, item) => sum + item.itemTotalMilliunits, 0)).toBe(-39940);
    });

    it('leaves items that already match the bank charge', () => {
        const billed = allocateAmazonItemsToBank([{ title: 'Pillow', itemTotalMilliunits: 35990 }], -35990);
        expect(billed[0]?.itemTotalMilliunits).toBe(-35990);
    });

    it('prorates several items and puts remainder on the last', () => {
        const billed = allocateAmazonItemsToBank(
            [
                { title: 'A', itemTotalMilliunits: 20000 },
                { title: 'B', itemTotalMilliunits: 20000 },
            ],
            -30000,
        );
        expect(billed.map((item) => item.itemTotalMilliunits)).toEqual([-15000, -15000]);
        expect(billed.reduce((sum, item) => sum + item.itemTotalMilliunits, 0)).toBe(-30000);
    });
});
