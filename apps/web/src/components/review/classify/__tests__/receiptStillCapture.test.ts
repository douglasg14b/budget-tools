import { afterEach, describe, expect, it, vi } from 'vitest';

import { RECEIPT_STILL_UNSUPPORTED_MESSAGE, takeReceiptStillBlob } from '../receiptStillCapture';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('takeReceiptStillBlob', () => {
    it('refuses when ImageCapture is missing', async () => {
        vi.stubGlobal('ImageCapture', undefined);
        await expect(takeReceiptStillBlob({} as MediaStreamTrack)).rejects.toThrow(RECEIPT_STILL_UNSUPPORTED_MESSAGE);
    });

    it('asks for the largest still the current track can take', async () => {
        const takePhoto = vi.fn(async (settings?: { imageHeight?: number; imageWidth?: number }) => {
            expect(settings).toEqual({ imageWidth: 4000, imageHeight: 3000 });
            return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
        });
        class FakeImageCapture {
            takePhoto = takePhoto;
            async getPhotoCapabilities() {
                return {
                    imageWidth: { min: 640, max: 4000 },
                    imageHeight: { min: 480, max: 3000 },
                };
            }
        }
        vi.stubGlobal('ImageCapture', FakeImageCapture);
        await expect(takeReceiptStillBlob({} as MediaStreamTrack)).resolves.toBeInstanceOf(Blob);
        expect(takePhoto).toHaveBeenCalledTimes(1);
    });

    it('takes a still without size hints when photo capabilities fail', async () => {
        const takePhoto = vi.fn(async (settings?: unknown) => {
            expect(settings).toBeUndefined();
            return new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
        });
        class FakeImageCapture {
            takePhoto = takePhoto;
            async getPhotoCapabilities() {
                throw new Error('capabilities unavailable');
            }
        }
        vi.stubGlobal('ImageCapture', FakeImageCapture);
        await expect(takeReceiptStillBlob({} as MediaStreamTrack)).resolves.toBeInstanceOf(Blob);
    });

    it('takes a still without size hints when the track does not report photo capabilities', async () => {
        const takePhoto = vi.fn(async (settings?: unknown) => {
            expect(settings).toBeUndefined();
            return new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
        });
        class FakeImageCapture {
            takePhoto = takePhoto;
        }
        vi.stubGlobal('ImageCapture', FakeImageCapture);
        await expect(takeReceiptStillBlob({} as MediaStreamTrack)).resolves.toBeInstanceOf(Blob);
    });

    it('refuses an empty still', async () => {
        class FakeImageCapture {
            async takePhoto() {
                return new Blob([], { type: 'image/jpeg' });
            }
        }
        vi.stubGlobal('ImageCapture', FakeImageCapture);
        await expect(takeReceiptStillBlob({} as MediaStreamTrack)).rejects.toThrow(
            'The camera returned an empty still photo.',
        );
    });
});
