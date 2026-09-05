import type { CornerEditor, CornerEditorOptions, CornerPoints } from 'scanic';
import { createCornerEditor, extractDocument, initialize, scanDocument } from 'scanic';

export const SCANIC_WASM_MISSING_MESSAGE =
    'Receipt prep could not load WebAssembly. This browser cannot crop the slip.';

export const RECEIPT_CAPTURE_JPEG_QUALITY = 0.92;

/** Detection downscale for any classical pass. The ML detector resizes to 224 internally. */
export const RECEIPT_DETECT_MAX_DIMENSION = 1280;

export const RECEIPT_DETECT_DETECTOR = 'ml' as const;

export type ReceiptScanImage = HTMLImageElement | HTMLCanvasElement | ImageData;

export type ReceiptScanCorners = CornerPoints;

export type ReceiptScanResult =
    | { readonly kind: 'detected'; readonly corners: ReceiptScanCorners }
    | { readonly kind: 'no-quad'; readonly message: string };

export type ScanicEngine = {
    readonly initialize: () => Promise<unknown | null>;
    readonly scanDocument: typeof scanDocument;
    readonly extractDocument: typeof extractDocument;
};

/**
 * Scanic's published types omit `initialize`, but the ESM build exports it.
 * It resolves to the WASM instance, or null when the JS detector would be used.
 */
function defaultScanicEngine(): ScanicEngine {
    return {
        initialize,
        scanDocument,
        extractDocument,
    };
}

function receiptDetectOptions() {
    return {
        mode: 'detect' as const,
        detector: RECEIPT_DETECT_DETECTOR,
        maxProcessingDimension: RECEIPT_DETECT_MAX_DIMENSION,
    };
}

/**
 * Refuse Scanic's silent JS fallback. `initialize()` returns null when WASM cannot run.
 */
export async function ensureScanicWasm(engine: ScanicEngine = defaultScanicEngine()): Promise<void> {
    const wasm = await engine.initialize();
    if (wasm == null) {
        throw new Error(SCANIC_WASM_MISSING_MESSAGE);
    }
}

/**
 * Fetch and compile the ML corner model so the first snap is not a 2 MB stall.
 * A blank canvas is enough: Scanic throws on CDN/runtime failure and returns no-quad otherwise.
 */
export async function warmupReceiptMlDetector(engine: ScanicEngine = defaultScanicEngine()): Promise<void> {
    await ensureScanicWasm(engine);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    await engine.scanDocument(canvas, receiptDetectOptions());
}

/**
 * Detect paper corners with Scanic's DocCornerNet model. Warp waits until the reviewer confirms.
 */
export async function scanReceiptImage(
    image: ReceiptScanImage,
    engine: ScanicEngine = defaultScanicEngine(),
): Promise<ReceiptScanResult> {
    await ensureScanicWasm(engine);
    const result = await engine.scanDocument(image, receiptDetectOptions());
    if (!result.success || !result.corners) {
        return {
            kind: 'no-quad',
            message: result.message || 'No document detected',
        };
    }
    return {
        kind: 'detected',
        corners: result.corners,
    };
}

/**
 * Warp using corners the reviewer confirmed in the editor.
 */
export async function extractReceiptImage(
    image: ReceiptScanImage,
    corners: ReceiptScanCorners,
    engine: ScanicEngine = defaultScanicEngine(),
): Promise<string> {
    await ensureScanicWasm(engine);
    const result = await engine.extractDocument(image, corners, { output: 'canvas' });
    const processedDataUrl = jpegDataUrlFromScanicOutput(result.output);
    if (!result.success || !processedDataUrl) {
        throw new Error(result.message || 'Could not warp that receipt from the confirmed corners.');
    }
    return processedDataUrl;
}

export type MountScanicCornerEditorInput = {
    readonly container: HTMLElement;
    readonly image: ReceiptScanImage;
    readonly corners?: ReceiptScanCorners | null;
    readonly onConfirm: (corners: ReceiptScanCorners) => void;
    readonly onCancel: () => void;
};

/**
 * Mount Scanic's corner editor into a host element. Caller must `destroy()` on unmount.
 */
export function mountScanicCornerEditor(input: MountScanicCornerEditorInput): CornerEditor {
    const options: CornerEditorOptions = {
        container: input.container,
        image: input.image,
        toolbar: { enabled: false },
        handleHitArea: 48,
        onConfirm: input.onConfirm,
        onCancel: input.onCancel,
    };
    if (input.corners) {
        options.corners = input.corners;
    }
    return createCornerEditor(options);
}

/**
 * Decode a data URL into an image Scanic can scan.
 */
export async function loadReceiptImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            resolve(image);
        };
        image.onerror = () => {
            reject(new Error('Could not decode that photo for receipt prep.'));
        };
        image.src = dataUrl;
    });
}

function jpegDataUrlFromScanicOutput(output: unknown): string | null {
    if (!output || typeof output !== 'object' || !('toDataURL' in output)) {
        return null;
    }
    const canvas = output as { toDataURL: (type?: string, quality?: number) => string };
    if (typeof canvas.toDataURL !== 'function') {
        return null;
    }
    return canvas.toDataURL('image/jpeg', RECEIPT_CAPTURE_JPEG_QUALITY);
}
