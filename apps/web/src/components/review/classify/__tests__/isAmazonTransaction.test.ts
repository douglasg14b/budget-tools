import { describe, expect, it } from 'vitest';

import { isAmazonTransaction } from '../isAmazonTransaction';

describe('isAmazonTransaction', () => {
    it('matches amazon / amzn payee text only', () => {
        expect(
            isAmazonTransaction({
                payeeName: 'Amazon',
                importPayeeName: null,
                importPayeeNameOriginal: null,
            }),
        ).toBe(true);
        expect(
            isAmazonTransaction({
                payeeName: 'Whole Foods',
                importPayeeName: 'WHOLEFDS',
                importPayeeNameOriginal: null,
            }),
        ).toBe(false);
        expect(
            isAmazonTransaction({
                payeeName: 'Walmart',
                importPayeeName: null,
                importPayeeNameOriginal: 'WALMART',
            }),
        ).toBe(false);
    });
});
