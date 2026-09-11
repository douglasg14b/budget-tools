import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
    assertPerceptualHashFormat,
    findNearestPerceptualMatch,
    hammingDistance,
    isWithinPerceptualTau,
    PERCEPTUAL_HASH_LENGTH,
    perceptualHashOf,
} from '../perceptualHash';

function bits(onesAt: readonly number[]): string {
    const chars = Array.from({ length: PERCEPTUAL_HASH_LENGTH }, () => '0');
    for (const index of onesAt) {
        chars[index] = '1';
    }
    return chars.join('');
}

async function solidJpeg(color: { r: number; g: number; b: number }): Promise<Buffer> {
    return sharp({
        create: { width: 32, height: 32, channels: 3, background: color },
    })
        .jpeg()
        .toBuffer();
}

describe('assertPerceptualHashFormat', () => {
    it('accepts a 64-bit 0/1 string', () => {
        expect(() => assertPerceptualHashFormat(bits([]))).not.toThrow();
    });

    it('rejects wrong length or non-bits', () => {
        expect(() => assertPerceptualHashFormat('01')).toThrow(/64 bits/);
        expect(() => assertPerceptualHashFormat(`${'2'.repeat(PERCEPTUAL_HASH_LENGTH)}`)).toThrow(/64 bits/);
    });
});

describe('hammingDistance', () => {
    it('returns 0 for identical hashes', () => {
        const hash = bits([0, 1, 2]);
        expect(hammingDistance(hash, hash)).toBe(0);
    });

    it('counts differing bits', () => {
        expect(hammingDistance(bits([]), bits([0, 1, 2, 3, 4]))).toBe(5);
        expect(hammingDistance(bits([]), bits([0, 1, 2, 3, 4, 5]))).toBe(6);
    });

    it('throws when lengths differ', () => {
        expect(() => hammingDistance('01', bits([]))).toThrow(/64 bits/);
    });
});

describe('isWithinPerceptualTau', () => {
    it('treats 5 as a match and 6 as a miss', () => {
        expect(isWithinPerceptualTau(5)).toBe(true);
        expect(isWithinPerceptualTau(6)).toBe(false);
    });

    it('rejects negative distances', () => {
        expect(() => isWithinPerceptualTau(-1)).toThrow(/non-negative integer/);
    });
});

describe('perceptualHashOf', () => {
    it('returns a 64-bit string for a real JPEG', async () => {
        const hash = await perceptualHashOf(await solidJpeg({ r: 40, g: 40, b: 40 }));
        expect(hash).toHaveLength(PERCEPTUAL_HASH_LENGTH);
        expect(hash).toMatch(/^[01]+$/);
    });

    it('hashes the same JPEG to distance 0', async () => {
        const jpeg = await solidJpeg({ r: 40, g: 40, b: 40 });
        const left = await perceptualHashOf(jpeg);
        const right = await perceptualHashOf(jpeg);
        expect(hammingDistance(left, right)).toBe(0);
        expect(isWithinPerceptualTau(0)).toBe(true);
    });

    it('keeps a dark JPEG and a bright JPEG farther than tau', async () => {
        const dark = await perceptualHashOf(await solidJpeg({ r: 10, g: 10, b: 10 }));
        const bright = await perceptualHashOf(await solidJpeg({ r: 240, g: 240, b: 240 }));
        expect(isWithinPerceptualTau(hammingDistance(dark, bright))).toBe(false);
    });
});

describe('findNearestPerceptualMatch', () => {
    it('returns null when every neighbor is farther than tau', () => {
        expect(
            findNearestPerceptualMatch(bits([]), [
                { id: 'b', createdAt: '2026-01-02T00:00:00.000Z', perceptualHash: bits([0, 1, 2, 3, 4, 5]) },
            ]),
        ).toBeNull();
    });

    it('reuses distance 5 and ignores distance 6', () => {
        const within = { id: 'near', createdAt: '2026-01-02T00:00:00.000Z', perceptualHash: bits([0, 1, 2, 3, 4]) };
        const far = { id: 'far', createdAt: '2026-01-01T00:00:00.000Z', perceptualHash: bits([0, 1, 2, 3, 4, 5]) };
        expect(findNearestPerceptualMatch(bits([]), [far, within])?.id).toBe('near');
    });

    it('picks the oldest createdAt then lowest id among in-tau neighbors', () => {
        const older = { id: 'z', createdAt: '2026-01-01T00:00:00.000Z', perceptualHash: bits([0]) };
        const newer = { id: 'a', createdAt: '2026-01-02T00:00:00.000Z', perceptualHash: bits([1]) };
        expect(findNearestPerceptualMatch(bits([]), [newer, older])?.id).toBe('z');
        const sameTimeLower = { id: 'a', createdAt: '2026-01-01T00:00:00.000Z', perceptualHash: bits([0]) };
        const sameTimeHigher = { id: 'b', createdAt: '2026-01-01T00:00:00.000Z', perceptualHash: bits([1]) };
        expect(findNearestPerceptualMatch(bits([]), [sameTimeHigher, sameTimeLower])?.id).toBe('a');
    });
});
