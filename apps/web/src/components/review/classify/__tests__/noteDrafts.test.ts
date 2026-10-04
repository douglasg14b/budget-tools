import type { TransactionDetailDto, YnabFlagColor } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';
import { decidedNote, displayedNote, noteChanges, setNoteFlag, setNoteMemo } from '../noteDrafts';
import type { SessionDecision } from '../sessionDecisions';

describe('noteDrafts', () => {
    it('shows the mirrored memo and flag until the reviewer edits them', () => {
        const flagged = transaction('Costco run', 'red');
        expect(displayedNote(flagged, undefined)).toEqual({ memo: 'Costco run', flagColor: 'red' });
        const drafts = setNoteFlag(setNoteMemo({}, 'tx-1', 'Costco run '), 'tx-1', null);
        expect(displayedNote(flagged, drafts['tx-1'])).toEqual({ memo: 'Costco run ', flagColor: null });
    });

    it('reports only the fields that differ from the transaction', () => {
        const flagged = transaction('Costco run', 'red');
        expect(noteChanges(flagged, undefined)).toEqual({});
        expect(noteChanges(flagged, { memo: '  Costco run ', flagColor: 'red' })).toEqual({});
        expect(noteChanges(flagged, { memo: 'Costco run, gift' })).toEqual({ memo: 'Costco run, gift' });
        expect(noteChanges(flagged, { flagColor: 'blue' })).toEqual({ flagColor: 'blue' });
    });

    it('clears a non-empty memo or flag with null', () => {
        expect(noteChanges(transaction('Costco run', 'red'), { memo: '   ', flagColor: null })).toEqual({
            memo: null,
            flagColor: null,
        });
    });

    it('treats a blank memo on an empty transaction memo as unchanged', () => {
        expect(noteChanges(transaction(null, null), { memo: '  ', flagColor: null })).toEqual({});
    });

    it('shows the decision values once decided', () => {
        const decision: SessionDecision = {
            kind: 'category',
            action: 'approved',
            categoryGroup: 'Needs',
            categoryId: 'cat-1',
            categoryName: 'Groceries',
            transactionId: 'tx-1',
            memo: 'USB-C cable',
        };
        expect(decidedNote({ memo: '', flagColor: 'red' }, decision)).toEqual({
            memo: 'USB-C cable',
            flagColor: 'red',
        });
        expect(decidedNote({ memo: 'old', flagColor: 'red' }, { ...decision, memo: null, flagColor: null })).toEqual({
            memo: '',
            flagColor: null,
        });
    });
});

function transaction(memo: string | null, flagColor: YnabFlagColor | null): TransactionDetailDto {
    return {
        id: 'tx-1',
        date: '2026-01-15',
        amount: -1000,
        memo,
        cleared: 'cleared',
        approved: false,
        flagColor,
        flagName: null,
        accountId: 'acct-1',
        accountName: 'Checking',
        payeeId: null,
        payeeName: 'Store',
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: null,
        importPayeeNameOriginal: null,
    };
}
