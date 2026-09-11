import phash from 'sharp-phash';

export const PERCEPTUAL_HASH_LENGTH = 64;
export const PERCEPTUAL_HASH_TAU = 5;

const BIT_PATTERN = /^[01]+$/;

export function assertPerceptualHashFormat(hash: string): void {
    if (hash.length !== PERCEPTUAL_HASH_LENGTH || !BIT_PATTERN.test(hash)) {
        throw new Error(`perceptual hash must be ${PERCEPTUAL_HASH_LENGTH} bits`);
    }
}

export async function perceptualHashOf(bytes: Buffer): Promise<string> {
    const hash = await phash(bytes);
    assertPerceptualHashFormat(hash);
    return hash;
}

export function hammingDistance(left: string, right: string): number {
    assertPerceptualHashFormat(left);
    assertPerceptualHashFormat(right);
    let distance = 0;
    for (let index = 0; index < PERCEPTUAL_HASH_LENGTH; index += 1) {
        if (left[index] !== right[index]) {
            distance += 1;
        }
    }
    return distance;
}

export function isWithinPerceptualTau(distance: number): boolean {
    if (!Number.isInteger(distance) || distance < 0) {
        throw new Error('Hamming distance must be a non-negative integer');
    }
    return distance <= PERCEPTUAL_HASH_TAU;
}
