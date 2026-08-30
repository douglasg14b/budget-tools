import sharp from 'sharp';

import { HttpError } from '../../travelWindows/HttpError';

export const RECEIPT_PREP_MAX_WIDTH = 1280;

export type PrepReceiptImageInput = {
    readonly frames: readonly Buffer[];
    readonly maxWidth?: number;
};

/**
 * Downsample, normalise contrast, and vertically stitch frames. Deskew is not applied.
 * Returns JPEG bytes for OpenRouter — never the stored original.
 */
export async function prepReceiptImage(input: PrepReceiptImageInput): Promise<Buffer> {
    if (input.frames.length === 0) {
        throw new HttpError(400, 'Receipt extract requires at least one frame');
    }
    const maxWidth = input.maxWidth ?? RECEIPT_PREP_MAX_WIDTH;
    const processed = await Promise.all(input.frames.map((frame) => prepFrame(frame, maxWidth)));
    if (processed.length === 1) {
        const only = processed[0];
        if (!only) {
            throw new HttpError(400, 'Receipt extract requires at least one frame');
        }
        return only;
    }
    return stitchVertically(processed);
}

export function jpegDataUrl(bytes: Buffer): string {
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

async function prepFrame(bytes: Buffer, maxWidth: number): Promise<Buffer> {
    try {
        return await sharp(bytes)
            .rotate()
            .normalise()
            .resize({ width: maxWidth, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new HttpError(400, `Receipt image could not be processed: ${detail}`);
    }
}

async function stitchVertically(frames: readonly Buffer[]): Promise<Buffer> {
    const metas = await Promise.all(frames.map((frame) => sharp(frame).metadata()));
    const width = Math.max(...metas.map((meta) => meta.width ?? 0));
    if (width <= 0) {
        throw new HttpError(400, 'Receipt frames have no width after prep');
    }
    const aligned = await Promise.all(
        frames.map((frame, index) => {
            const meta = metas[index];
            if ((meta?.width ?? 0) === width) {
                return frame;
            }
            return sharp(frame).resize({ width }).jpeg({ quality: 80 }).toBuffer();
        }),
    );
    const alignedMetas = await Promise.all(aligned.map((frame) => sharp(frame).metadata()));
    let top = 0;
    const composites: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const [index, frame] of aligned.entries()) {
        composites.push({ input: frame, left: 0, top });
        top += alignedMetas[index]?.height ?? 0;
    }
    if (top <= 0) {
        throw new HttpError(400, 'Receipt frames have no height after prep');
    }
    try {
        return await sharp({
            create: {
                width,
                height: top,
                channels: 3,
                background: { r: 255, g: 255, b: 255 },
            },
        })
            .composite(composites)
            .jpeg({ quality: 80 })
            .toBuffer();
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new HttpError(400, `Receipt frames could not be stitched: ${detail}`);
    }
}
