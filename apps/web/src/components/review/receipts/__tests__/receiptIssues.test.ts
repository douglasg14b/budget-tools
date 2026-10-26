import { describe, expect, it } from 'vitest';

import type { ReceiptIssueFields } from '../receiptIssues';
import { receiptHasIssue, receiptIssueNotes, receiptIssues } from '../receiptIssues';

const clean: ReceiptIssueFields = {
    extractStatus: 'gated',
    extractJson: JSON.stringify({ lines: [] }),
    totalsDisagree: false,
    transactionId: null,
    bindCheckOutcome: null,
};

describe('receiptIssues', () => {
    it('mirrors the API: status, flags, and the last check while unbound', () => {
        expect(receiptIssues(clean)).toEqual([]);
        expect(receiptIssues({ ...clean, extractStatus: 'failed' })).toEqual(['unreadable']);
        expect(receiptIssues({ ...clean, extractStatus: 'ungated' })).toEqual(['needs-look']);
        expect(receiptIssues({ ...clean, extractJson: JSON.stringify({ lines: [], error: 'x' }) })).toEqual([
            'flagged',
        ]);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'not-confirmed' })).toEqual(['bind-not-confirmed']);
        expect(receiptIssues({ ...clean, bindCheckOutcome: 'not-confirmed', transactionId: 't' })).toEqual([]);
        expect(receiptHasIssue({ ...clean, bindCheckOutcome: 'no-candidate' }, 'any')).toBe(false);
    });
});

describe('receiptIssueNotes', () => {
    it('explains flags and stalled auto-binds, not what the status line already says', () => {
        expect(receiptIssueNotes({ ...clean, extractStatus: 'failed' })).toEqual([]);
        expect(
            receiptIssueNotes({
                ...clean,
                extractJson: JSON.stringify({ lines: [], error: 'lines: timeout', verifyFlags: ['vendor-suspect'] }),
                bindCheckOutcome: 'ambiguous',
            }),
        ).toEqual([
            'A read step hit an error.',
            'Store name may be misread.',
            'Auto-bind: more than one charge looked right, so it waited for you.',
        ]);
    });
});
