import { describe, expect, it } from 'vitest';

import type { ReceiptIssueFields } from '../receiptIssues';
import { receiptHasIssue, receiptIssues } from '../receiptIssues';

const clean: ReceiptIssueFields = {
    extractStatus: 'gated',
    extractJson: JSON.stringify({ lines: [], error: null, verifyFlags: [] }),
    totalsDisagree: false,
    transactionId: null,
    bindCheckOutcome: null,
};

describe('receiptIssues', () => {
    it('finds nothing on a clean gated receipt', () => {
        expect(receiptIssues(clean)).toEqual([]);
        expect(receiptHasIssue(clean, 'any')).toBe(false);
    });

    it('reads the extract status', () => {
        expect(receiptIssues({ ...clean, extractStatus: 'failed' })).toEqual(['unreadable']);
        expect(receiptIssues({ ...clean, extractStatus: 'pending' })).toEqual(['extracting']);
        expect(receiptIssues({ ...clean, extractStatus: 'ungated' })).toEqual(['needs-look']);
        expect(receiptIssues({ ...clean, totalsDisagree: true })).toEqual(['needs-look']);
    });

    it('flags a finished extract that errored or was flagged by the verify pass', () => {
        expect(
            receiptIssues({ ...clean, extractJson: JSON.stringify({ lines: [], error: 'lines: timeout' }) }),
        ).toEqual(['flagged']);
        expect(
            receiptIssues({ ...clean, extractJson: JSON.stringify({ lines: [], verifyFlags: ['vendor-suspect'] }) }),
        ).toEqual(['flagged']);
        expect(receiptIssues({ ...clean, extractJson: null })).toEqual([]);
    });

    it('reports the last auto-bind check only while unbound', () => {
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'ambiguous' })).toEqual(['bind-ambiguous']);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'not-confirmed' })).toEqual(['bind-not-confirmed']);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'jev-unavailable' })).toEqual(['bind-jev-unavailable']);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'no-candidate' })).toEqual(['bind-no-charge']);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'lost-race' })).toEqual([]);
        // Bound by hand after an ambiguous check: the stale outcome no longer applies.
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'ambiguous', transactionId: 'txn-1' })).toEqual([]);
        // Retried: pending again, so the old check waits for the new extract.
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'ambiguous', extractStatus: 'pending' })).toEqual([
            'extracting',
        ]);
    });

    it('leaves the waiting states out of any, but they can be picked on their own', () => {
        const waiting = { ...clean, bindCheckOutcome: 'no-candidate' as const };
        expect(receiptHasIssue(waiting, 'any')).toBe(false);
        expect(receiptHasIssue(waiting, 'bind-no-charge')).toBe(true);
        expect(receiptHasIssue({ ...clean, extractStatus: 'pending' }, 'any')).toBe(false);
        expect(receiptHasIssue({ ...clean, extractStatus: 'pending' }, 'extracting')).toBe(true);
        expect(receiptHasIssue({ ...waiting, extractStatus: 'ungated' }, 'any')).toBe(true);
    });
});
