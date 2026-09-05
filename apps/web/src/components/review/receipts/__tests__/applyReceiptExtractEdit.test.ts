import { describe, expect, it } from 'vitest';
import type { PracticeReceipt } from '../../classify/practiceReceipts';
import {
    AMAZON_RECEIPT_EDIT_MESSAGE,
    applyPracticeReceiptExtractEdit,
    applyReceiptExtractEdit,
} from '../applyReceiptExtractEdit';

const cafeEdit = {
    vendor: 'Cafe Rio',
    purchaseDate: '2026-08-01',
    printedMilliunits: 8120,
    taxMilliunits: 620,
    discountMilliunits: 200,
    lines: [
        { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
        { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
    ],
};

const sessionReceipt: PracticeReceipt = {
    id: 'r1',
    transactionId: 'txn-1',
    frames: ['data:image/jpeg;base64,aa'],
    processedPreview: 'data:image/jpeg;base64,warp',
    vendor: 'Unknown',
    purchaseDate: '2026-07-01',
    printedMilliunits: 1,
    totalsDisagree: true,
    extractStatus: 'ungated',
    extractJson: '{"error":"old"}',
    rawText: 'old',
};

describe('applyReceiptExtractEdit', () => {
    it('marks gated when the printed total matches lines', () => {
        const applied = applyReceiptExtractEdit({ previousExtractJson: null, edit: cafeEdit });
        expect(applied.extractStatus).toBe('gated');
        expect(applied.totalsDisagree).toBe(false);
        expect(JSON.parse(applied.extractJson)).toMatchObject({ gated: true, error: null });
    });

    it('marks ungated when amounts do not match and failed when a key is missing', () => {
        expect(
            applyReceiptExtractEdit({
                previousExtractJson: null,
                edit: { ...cafeEdit, printedMilliunits: 9000 },
            }).extractStatus,
        ).toBe('ungated');
        expect(
            applyReceiptExtractEdit({
                previousExtractJson: null,
                edit: { ...cafeEdit, vendor: '' },
            }).extractStatus,
        ).toBe('failed');
    });

    it('refuses Amazon vendors', () => {
        expect(() =>
            applyReceiptExtractEdit({
                previousExtractJson: null,
                edit: { ...cafeEdit, vendor: 'Amazon.com' },
            }),
        ).toThrow(AMAZON_RECEIPT_EDIT_MESSAGE);
    });
});

describe('applyPracticeReceiptExtractEdit', () => {
    it('updates only the edited session receipt and keeps the bind', () => {
        const next = applyPracticeReceiptExtractEdit([sessionReceipt], 'r1', cafeEdit);
        expect(next[0]?.vendor).toBe('Cafe Rio');
        expect(next[0]?.transactionId).toBe('txn-1');
        expect(next[0]?.extractStatus).toBe('gated');
        expect(next[0]?.totalsDisagree).toBe(false);
    });
});
