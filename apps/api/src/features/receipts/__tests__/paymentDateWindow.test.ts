import { describe, expect, it } from 'vitest';

import { amazonPaymentDateWindow } from '../../amazonClassify/matchAmazonPayment';
import { addIsoDays } from '../../amazonOrders/isoDate';
import { bankDateWindowForPurchaseDate, isDateInPaymentWindow, paymentDateWindow } from '../paymentDateWindow';

describe('paymentDateWindow', () => {
    it('shares addIsoDays bank minus 5 plus 1 with Amazon', () => {
        const bankDate = '2026-02-10';
        expect(paymentDateWindow(bankDate)).toEqual({
            earliestDate: addIsoDays(bankDate, -5),
            latestDate: addIsoDays(bankDate, 1),
        });
        expect(paymentDateWindow(bankDate)).toEqual(amazonPaymentDateWindow(bankDate));
        expect(paymentDateWindow(bankDate)).toEqual({ earliestDate: '2026-02-05', latestDate: '2026-02-11' });
    });

    it('inverts to bank dates whose window contains the purchase date', () => {
        expect(bankDateWindowForPurchaseDate('2026-02-05')).toEqual({
            earliestDate: '2026-02-04',
            latestDate: '2026-02-10',
        });
        expect(isDateInPaymentWindow('2026-02-05', '2026-02-10')).toBe(true);
        expect(isDateInPaymentWindow('2026-02-11', '2026-02-10')).toBe(true);
        expect(isDateInPaymentWindow('2026-02-04', '2026-02-10')).toBe(false);
        expect(isDateInPaymentWindow('2026-02-12', '2026-02-10')).toBe(false);
    });
});
