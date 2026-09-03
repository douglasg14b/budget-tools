import { describe, expect, it } from 'vitest';

import {
    assertReceiptJsonBodyWithinLimit,
    buildCreateReceiptBody,
    buildExtractPreviewBody,
    liveReceiptImageSrc,
    practiceReceiptImageSrc,
    RECEIPT_BODY_TOO_LARGE_MESSAGE,
    RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES,
} from '../receiptCaptureAttach';
import { canAttachReceiptDraft, EMPTY_RECEIPT_CAPTURE_DRAFT, reduceReceiptCaptureDraft } from '../receiptCaptureDraft';

describe('reduceReceiptCaptureDraft', () => {
    it('replaces a ready draft when a second still is captured', () => {
        const ready = reduceReceiptCaptureDraft(
            reduceReceiptCaptureDraft(EMPTY_RECEIPT_CAPTURE_DRAFT, { type: 'capture', original: 'orig-1' }),
            { type: 'extracted', original: 'orig-1', processed: 'proc-1' },
        );
        expect(ready).toEqual({ status: 'ready', original: 'orig-1', processed: 'proc-1' });
        expect(reduceReceiptCaptureDraft(ready, { type: 'capture', original: 'orig-2' })).toEqual({
            status: 'preparing',
            original: 'orig-2',
        });
    });

    it('blocks attach until a warp exists, including after a no-quad miss', () => {
        const preparing = reduceReceiptCaptureDraft(EMPTY_RECEIPT_CAPTURE_DRAFT, {
            type: 'capture',
            original: 'orig-1',
        });
        expect(canAttachReceiptDraft(preparing)).toBe(false);
        const missed = reduceReceiptCaptureDraft(preparing, { type: 'no-quad' });
        expect(missed).toEqual({ status: 'needs-corners', original: 'orig-1' });
        expect(canAttachReceiptDraft(missed)).toBe(false);
        const confirmed = reduceReceiptCaptureDraft(missed, {
            type: 'extracted',
            original: 'orig-1',
            processed: 'proc-1',
        });
        expect(canAttachReceiptDraft(confirmed)).toBe(true);
    });

    it('ignores a late extract after discard so a failed prep cannot look attached', () => {
        const preparing = reduceReceiptCaptureDraft(EMPTY_RECEIPT_CAPTURE_DRAFT, {
            type: 'capture',
            original: 'orig-1',
        });
        const discarded = reduceReceiptCaptureDraft(preparing, { type: 'discard' });
        expect(
            reduceReceiptCaptureDraft(discarded, { type: 'extracted', original: 'orig-1', processed: 'proc-1' }),
        ).toEqual(EMPTY_RECEIPT_CAPTURE_DRAFT);
        expect(canAttachReceiptDraft(discarded)).toBe(false);
    });

    it('ignores a stale warp from a previous still after a replacement capture', () => {
        const preparingFirst = reduceReceiptCaptureDraft(EMPTY_RECEIPT_CAPTURE_DRAFT, {
            type: 'capture',
            original: 'orig-1',
        });
        const replaced = reduceReceiptCaptureDraft(preparingFirst, { type: 'capture', original: 'orig-2' });
        expect(
            reduceReceiptCaptureDraft(replaced, { type: 'extracted', original: 'orig-1', processed: 'stale-proc' }),
        ).toEqual({ status: 'preparing', original: 'orig-2' });
        expect(canAttachReceiptDraft(replaced)).toBe(false);
        const ready = reduceReceiptCaptureDraft(replaced, {
            type: 'extracted',
            original: 'orig-2',
            processed: 'proc-2',
        });
        expect(ready).toEqual({ status: 'ready', original: 'orig-2', processed: 'proc-2' });
        expect(canAttachReceiptDraft(ready)).toBe(true);
    });
});

describe('receipt attach payload', () => {
    it('puts the original in frames and the Scanic JPEG in processed', () => {
        expect(
            buildCreateReceiptBody({
                original: 'data:image/jpeg;base64,orig',
                processed: 'data:image/jpeg;base64,proc',
                transactionId: 'txn-1',
            }),
        ).toEqual({
            frames: ['data:image/jpeg;base64,orig'],
            processed: 'data:image/jpeg;base64,proc',
            transactionId: 'txn-1',
        });
        expect(
            buildExtractPreviewBody({
                original: 'data:image/jpeg;base64,orig',
                processed: 'data:image/jpeg;base64,proc',
            }),
        ).toEqual({
            frames: ['data:image/jpeg;base64,orig'],
            processed: 'data:image/jpeg;base64,proc',
        });
    });

    it('uses 15728640 bytes as the client JSON cap and refuses larger bodies before mutate', () => {
        expect(RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES).toBe(15_728_640);
        const processed = 'x'.repeat(RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES);
        expect(() => assertReceiptJsonBodyWithinLimit({ frames: ['a'], processed })).toThrow(
            RECEIPT_BODY_TOO_LARGE_MESSAGE,
        );
        expect(() =>
            assertReceiptJsonBodyWithinLimit({
                frames: ['data:image/jpeg;base64,orig'],
                processed: 'data:image/jpeg;base64,proc',
            }),
        ).not.toThrow();
    });
});

describe('receipt thumbs', () => {
    it('uses GET variant=processed for Live when hasProcessed', () => {
        expect(liveReceiptImageSrc({ id: 'r1', hasProcessed: true })).toBe('/api/receipts/r1/image?variant=processed');
        expect(liveReceiptImageSrc({ id: 'r1', hasProcessed: false })).toBe('/api/receipts/r1/image');
    });

    it('prefers Practice processedPreview over frames[0]', () => {
        expect(
            practiceReceiptImageSrc({
                processedPreview: 'data:image/jpeg;base64,warp',
                frames: ['data:image/jpeg;base64,table'],
            }),
        ).toBe('data:image/jpeg;base64,warp');
        expect(
            practiceReceiptImageSrc({
                processedPreview: null,
                frames: ['data:image/jpeg;base64,table'],
            }),
        ).toBe('data:image/jpeg;base64,table');
    });
});
