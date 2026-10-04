import type { ClassificationDecisionDto } from '@budget-tools/web-sdk';

import type { DecisionNote } from './decisionNote';
import { hasNoteChanges } from './decisionNote';
import type { SessionDecision } from './sessionDecisions';

/**
 * Maps a session decision to the live write payload. Rejects are local-only. Annotations never
 * carry the payee rename: the server refuses payeeName on annotate.
 */
export function liveDecisionPayload(
    decision: SessionDecision,
    payeeName: string | undefined,
): ClassificationDecisionDto | null {
    const trimmedPayee = payeeName?.trim();
    const note = notePayload(decision);
    if (decision.kind === 'annotate') {
        if (!hasNoteChanges(note)) {
            return null;
        }
        return { transactionId: decision.transactionId, kind: 'annotate', ...note };
    }
    if (decision.kind === 'category') {
        if (decision.action === 'rejected' || !decision.categoryId) {
            return null;
        }
        return {
            transactionId: decision.transactionId,
            kind: 'category',
            categoryId: decision.categoryId,
            ...(trimmedPayee ? { payeeName: trimmedPayee } : {}),
            ...note,
        };
    }
    return {
        transactionId: decision.transactionId,
        kind: 'split',
        ...(trimmedPayee ? { payeeName: trimmedPayee } : {}),
        ...note,
        lines: decision.lines.map((line) => ({
            amount: line.amount,
            categoryId: line.categoryId,
            memo: line.memo?.trim() || null,
        })),
    };
}

/**
 * Absent fields stay absent (YNAB unchanged); null and blank memos clear.
 */
function notePayload(note: DecisionNote): Pick<ClassificationDecisionDto, 'memo' | 'flagColor'> {
    return {
        ...(note.memo === undefined ? {} : { memo: note.memo?.trim() || null }),
        ...(note.flagColor === undefined ? {} : { flagColor: note.flagColor }),
    };
}
