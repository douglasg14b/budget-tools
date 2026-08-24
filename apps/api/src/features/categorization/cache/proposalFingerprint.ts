import { createHash } from 'node:crypto';

export type ScoringFingerprintInput = {
    readonly importPayeeNameOriginal: string | null;
    readonly importPayeeName: string | null;
    readonly payeeName: string | null;
    readonly payeeId: string | null;
    readonly amount: number;
    readonly accountName: string;
    readonly memo: string | null;
    readonly date: string;
};

/**
 * Stable hash of the fields the categorization engine uses as scoring inputs.
 * Changing any of these invalidates a cached proposal for that transaction.
 */
export function scoringFingerprint(input: ScoringFingerprintInput): string {
    const payload = [
        input.date,
        String(input.amount),
        input.accountName,
        input.payeeId ?? '',
        input.payeeName ?? '',
        input.importPayeeName ?? '',
        input.importPayeeNameOriginal ?? '',
        input.memo ?? '',
    ].join('\0');

    return createHash('sha256').update(payload).digest('hex');
}
