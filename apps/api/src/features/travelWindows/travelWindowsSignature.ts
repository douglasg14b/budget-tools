import { createHash } from 'node:crypto';

export const TRAVEL_BIAS_OFF_SIGNATURE = 'off';

export type TravelWindowSignatureRow = {
    readonly id: string;
    readonly kind: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly location: string | null;
    readonly accountIds: readonly string[];
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
        .map((window) => {
            const accounts = [...window.accountIds].sort().join(',');
            return `${window.id}|${window.kind}|${window.startDate}|${window.endDate}|${window.location ?? ''}|${accounts}`;
        })
        .sort()
        .join('\n');
    return createHash('sha256').update(payload).digest('hex');
}

export function overlayFingerprint(scoringFingerprint: string, travelSignature: string): string {
    return `${scoringFingerprint}|${travelSignature}`;
}
