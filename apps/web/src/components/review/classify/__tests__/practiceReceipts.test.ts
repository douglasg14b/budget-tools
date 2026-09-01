import { describe, expect, it } from 'vitest';

import { bindPracticeReceipt, practiceReceiptFromExtract, toMatchPreviewReceipt } from '../practiceReceipts';

describe('practiceReceiptFromExtract', () => {
    it('returns null when extract dropped an Amazon vendor', () => {
        expect(
            practiceReceiptFromExtract('r1', 'txn-1', ['data:image/jpeg;base64,aa'], {
                droppedAsAmazon: true,
                extractStatus: null,
                vendor: 'Amazon',
                purchaseDate: null,
                printedMilliunits: null,
                totalsDisagree: false,
                extractJson: null,
                rawText: null,
            }),
        ).toBeNull();
    });

    it('keeps session keys for match-preview', () => {
        const receipt = practiceReceiptFromExtract('r1', 'txn-1', ['data:image/jpeg;base64,aa'], {
            droppedAsAmazon: false,
            extractStatus: 'gated',
            vendor: 'Save Mart',
            purchaseDate: '2010-10-23',
            printedMilliunits: 3990,
            totalsDisagree: false,
            extractJson: '{}',
            rawText: 'MILK',
        });
        expect(receipt).toEqual({
            id: 'r1',
            transactionId: 'txn-1',
            frames: ['data:image/jpeg;base64,aa'],
            vendor: 'Save Mart',
            purchaseDate: '2010-10-23',
            printedMilliunits: 3990,
            totalsDisagree: false,
            extractStatus: 'gated',
            extractJson: '{}',
            rawText: 'MILK',
        });
        if (!receipt) {
            throw new Error('expected a practice receipt');
        }
        expect(toMatchPreviewReceipt(receipt)).toEqual({
            id: 'r1',
            vendor: 'Save Mart',
            purchaseDate: '2010-10-23',
            printedMilliunits: 3990,
            totalsDisagree: false,
            extractStatus: 'gated',
            extractJson: '{}',
        });
    });
});

describe('bindPracticeReceipt', () => {
    it('sets and clears a session bind without dropping the receipt', () => {
        const receipt = practiceReceiptFromExtract('r1', null, ['data:image/jpeg;base64,aa'], {
            droppedAsAmazon: false,
            extractStatus: 'gated',
            vendor: 'Save Mart',
            purchaseDate: '2010-10-23',
            printedMilliunits: 3990,
            totalsDisagree: false,
            extractJson: '{}',
            rawText: 'MILK',
        });
        if (!receipt) {
            throw new Error('expected a practice receipt');
        }
        const bound = bindPracticeReceipt([receipt], 'r1', 'txn-9');
        expect(bound[0]?.transactionId).toBe('txn-9');
        expect(bindPracticeReceipt(bound, 'r1', null)[0]?.transactionId).toBeNull();
    });
});
