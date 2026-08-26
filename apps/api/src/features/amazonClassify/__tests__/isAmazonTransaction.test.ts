import { describe, expect, it } from 'vitest';

import { isAmazonTransaction } from '../isAmazonTransaction';

describe('isAmazonTransaction', () => {
    it('detects amazon and amzn import strings', () => {
        expect(
            isAmazonTransaction({
                payeeName: 'Amazon',
                importPayeeName: null,
                importPayeeNameOriginal: null,
            }),
        ).toBe(true);
        expect(
            isAmazonTransaction({
                payeeName: null,
                importPayeeName: 'AMZN MKTP',
                importPayeeNameOriginal: null,
            }),
        ).toBe(true);
        expect(
            isAmazonTransaction({
                payeeName: 'Safeway',
                importPayeeName: 'SAFEWAY',
                importPayeeNameOriginal: null,
            }),
        ).toBe(false);
    });
});
