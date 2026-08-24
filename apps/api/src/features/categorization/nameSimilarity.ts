import { similarity } from 'talisman/metrics/ratcliff-obershelp';

/**
 * Ratcliff–Obershelp similarity of two names, case-insensitive.
 */
export function nameSimilarity(left: string, right: string): number {
    return similarity(left.trim().toUpperCase(), right.trim().toUpperCase());
}
