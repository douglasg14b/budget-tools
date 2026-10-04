import type { TransactionDetailDto, YnabFlagColor } from '@budget-tools/web-sdk';

import type { DecisionNote } from './decisionNote';
import { withNote } from './decisionNote';
import type { SessionDecision } from './sessionDecisions';

/**
 * The reviewer's unsaved memo / flag edits for one transaction. An absent field is untouched
 * and falls back to the transaction's mirrored value.
 */
export type NoteDraft = {
    readonly memo?: string;
    readonly flagColor?: YnabFlagColor | null;
};

export type NoteDrafts = Readonly<Record<string, NoteDraft>>;

export type DisplayedNote = {
    readonly memo: string;
    readonly flagColor: YnabFlagColor | null;
};

export function setNoteMemo(drafts: NoteDrafts, transactionId: string, memo: string): NoteDrafts {
    return { ...drafts, [transactionId]: { ...drafts[transactionId], memo } };
}

export function setNoteFlag(drafts: NoteDrafts, transactionId: string, flagColor: YnabFlagColor | null): NoteDrafts {
    return { ...drafts, [transactionId]: { ...drafts[transactionId], flagColor } };
}

export function displayedNote(transaction: TransactionDetailDto, draft: NoteDraft | undefined): DisplayedNote {
    return {
        memo: draft?.memo ?? transaction.memo ?? '',
        flagColor: draft?.flagColor === undefined ? transaction.flagColor : draft.flagColor,
    };
}

/**
 * What the card shows once decided: the decision's memo / flag where it set one (e.g. a collapsed
 * split's joined memo), else the draft or mirrored value.
 */
export function decidedNote(note: DisplayedNote, decision: SessionDecision): DisplayedNote {
    return {
        memo: decision.memo === undefined ? note.memo : (decision.memo ?? ''),
        flagColor: decision.flagColor === undefined ? note.flagColor : decision.flagColor,
    };
}

/**
 * Only the fields the reviewer changed relative to the transaction. A memo emptied from a
 * non-empty value clears (null); whitespace-only edits of an empty memo change nothing.
 */
export function noteChanges(transaction: TransactionDetailDto, draft: NoteDraft | undefined): DecisionNote {
    const flagColor =
        draft?.flagColor === undefined || draft.flagColor === transaction.flagColor ? undefined : draft.flagColor;
    const memo = draft?.memo === undefined ? undefined : changedMemo(transaction.memo, draft.memo);
    return withNote({}, { flagColor, memo });
}

function changedMemo(original: string | null, edited: string): string | null | undefined {
    const trimmed = edited.trim();
    if (trimmed === (original?.trim() ?? '')) {
        return undefined;
    }
    return trimmed || null;
}
