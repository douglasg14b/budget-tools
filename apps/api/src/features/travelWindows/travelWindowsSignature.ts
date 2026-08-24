import { createHash } from 'node:crypto';

export const TRAVEL_BIAS_OFF_SIGNATURE = 'off';

export type TravelWindowSignatureRow = {
    readonly id: string;
    readonly kind: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly accountId: string | null;
};

/**
 * Cache identity for travel bias. Off is a sentinel so editing trips while
 * disabled does not bust the current-behavior proposal cache.
 */
export function travelWindowsSignature(input: {
    readonly enabled: boolean;
    readonly windows: readonly TravelWindowSignatureRow[];
}): string {
    if (!input.enabled) {
        return TRAVEL_BIAS_OFF_SIGNATURE;
    }

    const payload = [...input.windows]
        .map((window) => `${window.id}|${window.kind}|${window.startDate}|${window.endDate}|${window.accountId ?? ''}`)
        .sort()
        .join('\n');
    return createHash('sha256').update(payload).digest('hex');
}

export function overlayFingerprint(scoringFingerprint: string, travelSignature: string): string {
    return `${scoringFingerprint}|${travelSignature}`;
}
