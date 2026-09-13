import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScanicEngine } from '../scanicReceiptPrep';
import {
    ensureScanicWasm,
    extractReceiptImage,
    RECEIPT_DETECT_DETECTOR,
    RECEIPT_DETECT_MAX_DIMENSION,
    SCANIC_ML_ASSET_BASE_URL,
    SCANIC_WASM_MISSING_MESSAGE,
    scanReceiptImage,
    warmupReceiptMlDetector,
} from '../scanicReceiptPrep';

vi.mock('scanic', () => ({
    initialize: vi.fn(async () => ({})),
    scanDocument: vi.fn(),
    extractDocument: vi.fn(),
    createCornerEditor: vi.fn(),
}));

const corners = {
    topLeft: { x: 1, y: 1 },
    topRight: { x: 10, y: 1 },
    bottomRight: { x: 10, y: 20 },
    bottomLeft: { x: 1, y: 20 },
};

function jpegCanvas(dataUrl: string): { toDataURL: (type?: string, quality?: number) => string } {
    return {
        toDataURL: (type?: string) => {
            expect(type).toBe('image/jpeg');
            return dataUrl;
        },
    };
}

function engine(overrides: Partial<ScanicEngine> = {}): ScanicEngine {
    return {
        initialize: async () => ({}),
        scanDocument: async () => ({
            success: true,
            message: 'ok',
            corners,
            output: jpegCanvas('data:image/jpeg;base64,processed') as unknown as HTMLCanvasElement,
            contour: null,
            debug: null,
            timings: [],
        }),
        extractDocument: async () => ({
            success: true,
            message: 'ok',
            corners,
            output: jpegCanvas('data:image/jpeg;base64,manual') as unknown as HTMLCanvasElement,
            contour: null,
            debug: null,
            timings: [],
        }),
        ...overrides,
    };
}

describe('ensureScanicWasm', () => {
    it('throws when initialize resolves to null so JS fallback cannot attach', async () => {
        await expect(ensureScanicWasm(engine({ initialize: async () => null }))).rejects.toThrow(
            SCANIC_WASM_MISSING_MESSAGE,
        );
    });

    it('resolves when WASM initialize returns a module', async () => {
        await expect(ensureScanicWasm(engine({ initialize: async () => ({ ok: true }) }))).resolves.toBeUndefined();
    });
});

describe('scanReceiptImage', () => {
    it('detects corners with the ML detector and does not warp yet', async () => {
        const source = { width: 100, height: 200 } as HTMLCanvasElement;
        const scanDocument = vi.fn(async () => ({
            success: true,
            message: 'Document detected (ml)',
            corners,
            output: null,
            contour: null,
            debug: null,
            timings: [],
        }));
        const result = await scanReceiptImage(source, engine({ scanDocument }));
        expect(scanDocument).toHaveBeenCalledWith(
            source,
            expect.objectContaining({
                mode: 'detect',
                detector: RECEIPT_DETECT_DETECTOR,
                maxProcessingDimension: RECEIPT_DETECT_MAX_DIMENSION,
                ml: { assetBaseUrl: SCANIC_ML_ASSET_BASE_URL },
            }),
        );
        expect(result).toEqual({
            kind: 'detected',
            corners,
        });
    });

    it('returns a typed no-quad miss instead of the original still', async () => {
        const result = await scanReceiptImage(
            {} as HTMLCanvasElement,
            engine({
                scanDocument: async () => ({
                    success: false,
                    message: 'No confident document (ml)',
                    corners: null,
                    output: null,
                    contour: null,
                    debug: null,
                    timings: [],
                }),
            }),
        );
        expect(result).toEqual({ kind: 'no-quad', message: 'No confident document (ml)' });
    });
});

describe('warmupReceiptMlDetector', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads the ML detector on a blank canvas and surfaces fetch failures', async () => {
        vi.stubGlobal('document', {
            createElement: (tag: string) => {
                expect(tag).toBe('canvas');
                return { width: 0, height: 0 };
            },
        });
        const scanDocument = vi.fn(async () => {
            throw new Error(`scanic: failed to fetch the ML model from ${SCANIC_ML_ASSET_BASE_URL}`);
        });
        await expect(warmupReceiptMlDetector(engine({ scanDocument }))).rejects.toThrow('failed to fetch the ML model');
        expect(scanDocument).toHaveBeenCalledWith(
            { width: 32, height: 32 },
            expect.objectContaining({
                detector: RECEIPT_DETECT_DETECTOR,
                ml: { assetBaseUrl: SCANIC_ML_ASSET_BASE_URL },
            }),
        );
    });
});

describe('extractReceiptImage', () => {
    it('warps confirmed corners to a JPEG data URL', async () => {
        await expect(extractReceiptImage({} as HTMLCanvasElement, corners, engine())).resolves.toBe(
            'data:image/jpeg;base64,manual',
        );
    });
});
