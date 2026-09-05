import { describe, expect, it } from 'vitest';

import { isFromReceiptsInbox, receiptsInboxBackTarget } from '../receiptsInboxBack';

describe('receiptsInboxBackTarget', () => {
    it('uses history when the reviewer arrived from the inbox list', () => {
        expect(receiptsInboxBackTarget({ search: '?tier=review', fromInbox: true })).toEqual({ kind: 'history' });
    });

    it('falls back to the inbox path and keeps search', () => {
        expect(receiptsInboxBackTarget({ search: '?tier=review', fromInbox: false })).toEqual({
            kind: 'inbox',
            pathname: '/receipts',
            search: '?tier=review',
        });
    });
});

describe('isFromReceiptsInbox', () => {
    it('accepts only the inbox location state flag', () => {
        expect(isFromReceiptsInbox({ fromInbox: true })).toBe(true);
        expect(isFromReceiptsInbox({ fromInbox: false })).toBe(false);
        expect(isFromReceiptsInbox(null)).toBe(false);
    });
});
