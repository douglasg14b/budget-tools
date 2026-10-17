import { describe, expect, it } from 'vitest';

import { decodeReceiptCursor, encodeReceiptCursor } from '../receiptListCursor';

describe('receiptListCursor', () => {
    it('round-trips createdAt and id', () => {
        const cursor = { createdAt: '2026-03-02T00:00:00.000Z', id: '0b6c1c8e-1f0d-4a8e-9d3c-3c1e2f4a5b6c' };
        const encoded = encodeReceiptCursor(cursor);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeReceiptCursor(encoded)).toEqual(cursor);
    });

    it.each([
        ['empty', ''],
        ['missing id', Buffer.from('2026-03-02T00:00:00.000Z', 'utf8').toString('base64url')],
        ['extra parts', Buffer.from('a\nb\nc', 'utf8').toString('base64url')],
        ['not base64url', '!!!'],
    ])('rejects a %s cursor with a 400', (_label, value) => {
        expect(() => decodeReceiptCursor(value)).toThrow(expect.objectContaining({ statusCode: 400 }));
    });
});
