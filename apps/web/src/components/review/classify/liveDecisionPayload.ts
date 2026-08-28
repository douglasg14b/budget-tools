import type { ClassificationDecisionDto } from '@budget-tools/web-sdk';

import type { SessionDecision } from './sessionDecisions';

/**
 * Maps a session decision to the live write payload. Rejects are local-only.
 */
export function liveDecisionPayload(
    decision: SessionDecision,
    payeeName: string | undefined,
): ClassificationDecisionDto | null {
    const trimmedPayee = payeeName?.trim();
    if (decision.kind === 'category') {
        if (decision.action === 'rejected' || !decision.categoryId) {
            return null;
        }
        return {
            transactionId: decision.transactionId,
            kind: 'category',
            categoryId: decision.categoryId,
            ...(trimmedPayee ? { payeeName: trimmedPayee } : {}),
        };
    }
    return {
        transactionId: decision.transactionId,
        kind: 'split',
        ...(trimmedPayee ? { payeeName: trimmedPayee } : {}),
        lines: decision.lines.map((line) => ({
            amount: line.amount,
            categoryId: line.categoryId,
            memo: line.memo,
        })),
    };
}
