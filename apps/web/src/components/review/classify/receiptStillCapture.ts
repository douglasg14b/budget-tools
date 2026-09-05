export const RECEIPT_STILL_UNSUPPORTED_MESSAGE =
    'This browser cannot take a still photo from the camera. Use Chrome, or upload a photo instead.';

type PhotoSizeRange = {
    readonly max?: number;
    readonly min?: number;
};

type PhotoCapabilities = {
    readonly imageHeight?: PhotoSizeRange;
    readonly imageWidth?: PhotoSizeRange;
};

type PhotoSettings = {
    readonly imageHeight?: number;
    readonly imageWidth?: number;
};

type ReceiptImageCapture = {
    getPhotoCapabilities?: () => Promise<PhotoCapabilities>;
    takePhoto: (photoSettings?: PhotoSettings) => Promise<Blob>;
};

type ReceiptImageCaptureCtor = new (track: MediaStreamTrack) => ReceiptImageCapture;

function imageCaptureCtor(): ReceiptImageCaptureCtor | undefined {
    const ctor = Reflect.get(globalThis, 'ImageCapture');
    if (typeof ctor !== 'function') {
        return undefined;
    }
    return ctor as ReceiptImageCaptureCtor;
}

/**
 * Full-resolution still from the open camera track. Preview `getUserMedia` frames stay low-res.
 */
export async function takeReceiptStillBlob(track: MediaStreamTrack): Promise<Blob> {
    const ImageCapture = imageCaptureCtor();
    if (!ImageCapture) {
        throw new Error(RECEIPT_STILL_UNSUPPORTED_MESSAGE);
    }
    const capture = new ImageCapture(track);
    const settings = await maxStillSettings(capture);
    const blob = settings ? await capture.takePhoto(settings) : await capture.takePhoto();
    if (blob.size <= 0) {
        throw new Error('The camera returned an empty still photo.');
    }
    return blob;
}

export async function decodeReceiptStill(blob: Blob): Promise<ImageBitmap> {
    return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

async function maxStillSettings(capture: ReceiptImageCapture): Promise<PhotoSettings | undefined> {
    if (typeof capture.getPhotoCapabilities !== 'function') {
        return undefined;
    }
    try {
        const capabilities = await capture.getPhotoCapabilities();
        const imageWidth = capabilities.imageWidth?.max;
        const imageHeight = capabilities.imageHeight?.max;
        if (typeof imageWidth !== 'number' || typeof imageHeight !== 'number') {
            return undefined;
        }
        if (imageWidth <= 0 || imageHeight <= 0) {
            return undefined;
        }
        return { imageWidth, imageHeight };
    } catch {
        return undefined;
    }
}
