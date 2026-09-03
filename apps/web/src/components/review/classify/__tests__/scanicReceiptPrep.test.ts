import { describe, expect, it, vi } from 'vitest';
import type { ScanicEngine } from '../scanicReceiptPrep';
import {
    ensureScanicWasm,
    extractReceiptImage,
    SCANIC_WASM_MISSING_MESSAGE,
    scanReceiptImage,
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
    it('returns a JPEG data URL and corners on a successful warp', async () => {
        const result = await scanReceiptImage({} as HTMLCanvasElement, engine());
        expect(result).toEqual({
            kind: 'extracted',
            processedDataUrl: 'data:image/jpeg;base64,processed',
            corners,
        });
    });

    it('returns a typed no-quad miss instead of the original still', async () => {
        const result = await scanReceiptImage(
            {} as HTMLCanvasElement,
            engine({
                scanDocument: async () => ({
                    success: false,
                    message: 'No document detected',
                    corners: null,
                    output: null,
                    contour: null,
                    debug: null,
                    timings: [],
                }),
            }),
        );
        expect(result).toEqual({ kind: 'no-quad', message: 'No document detected' });
    });

    it('treats a successful detect without a canvas warp as a no-quad miss', async () => {
        const result = await scanReceiptImage(
            {} as HTMLCanvasElement,
            engine({
                scanDocument: async () => ({
                    success: true,
                    message: 'ok',
                    corners,
                    output: null,
                    contour: null,
                    debug: null,
                    timings: [],
                }),
            }),
        );
        expect(result.kind).toBe('no-quad');
    });
});

describe('extractReceiptImage', () => {
    it('warps confirmed corners to a JPEG data URL', async () => {
        await expect(extractReceiptImage({} as HTMLCanvasElement, corners, engine())).resolves.toBe(
            'data:image/jpeg;base64,manual',
        );
    });
});
