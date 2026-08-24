/**
 * Formats a 0–1 confidence value as a whole-number percentage (`72%`).
 */
export function formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
}
