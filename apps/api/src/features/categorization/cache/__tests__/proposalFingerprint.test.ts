import { describe, expect, it } from 'vitest';

import { scoringFingerprint } from '../proposalFingerprint';

const base = {
    importPayeeNameOriginal: 'ORIG',
    importPayeeName: 'PAYEE',
    payeeName: 'Store',
    payeeId: 'payee-1',
    amount: -12000,
    accountName: 'Checking',
    memo: 'milk',
    date: '2026-01-15',
};

describe('scoringFingerprint', () => {
    it('is stable for the same scoring inputs', () => {
        expect(scoringFingerprint(base)).toBe(scoringFingerprint({ ...base }));
    });

    it('changes when a scoring input changes', () => {
        expect(scoringFingerprint({ ...base, memo: 'bread' })).not.toBe(scoringFingerprint(base));
        expect(scoringFingerprint({ ...base, amount: -1 })).not.toBe(scoringFingerprint(base));
        expect(scoringFingerprint({ ...base, payeeName: 'Other' })).not.toBe(scoringFingerprint(base));
    });
});
