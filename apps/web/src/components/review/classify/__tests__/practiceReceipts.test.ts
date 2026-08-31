import { describe, expect, it } from 'vitest';

import { practiceReceiptFromExtract, toMatchPreviewReceipt } from '../practiceReceipts';

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
        });
    });
});
