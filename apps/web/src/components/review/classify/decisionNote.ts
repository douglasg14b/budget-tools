import type { YnabFlagColor } from '@budget-tools/web-sdk';

import type { SplitLine } from './splitLines';

/** YNAB rejects parent memos longer than this. */
export const YNAB_MEMO_MAX_LENGTH = 500;

/**
 * Parent memo and YNAB flag edits carried by a decision. An absent field leaves YNAB's
 * value alone; null clears it.
 */
export type DecisionNote = {
    readonly memo?: string | null;
    readonly flagColor?: YnabFlagColor | null;
};

const LINE_MEMO_SEPARATOR = '; ';

export function hasNoteChanges(note: DecisionNote): boolean {
    return note.memo !== undefined || note.flagColor !== undefined;
}

/**
 * Copies only the note fields that are set, so absent stays absent on the decision.
 */
export function withNote<TDecision extends object>(decision: TDecision, note: DecisionNote): TDecision & DecisionNote {
    return {
        ...decision,
        ...(note.memo === undefined ? {} : { memo: note.memo }),
        ...(note.flagColor === undefined ? {} : { flagColor: note.flagColor }),
    };
}

/**
 * Parent memo for a split that collapses into one category, where YNAB keeps no line memos.
 * Non-empty line memos are joined with "; " and appended to the note (the edited memo, else the
 * transaction's own), unless the note already contains them. Returns the note's memo untouched
 * when no line has a memo, and undefined when the result equals the transaction's memo.
 */
export function collapsedSplitMemo(
    transactionMemo: string | null,
    lines: readonly SplitLine[],
    noteMemo: string | null | undefined,
): string | null | undefined {
    const joined = lines
        .map((line) => line.memo?.trim())
        .filter((memo): memo is string => Boolean(memo))
        .join(LINE_MEMO_SEPARATOR);
    if (!joined) {
        return noteMemo;
    }
    const base = (noteMemo === undefined ? transactionMemo : noteMemo)?.trim() ?? '';
    const combined = !base ? joined : base.includes(joined) ? base : `${base}${LINE_MEMO_SEPARATOR}${joined}`;
    const capped = capMemo(combined);
    return capped === (transactionMemo?.trim() ?? '') ? undefined : capped;
}

function capMemo(memo: string): string {
    if (memo.length <= YNAB_MEMO_MAX_LENGTH) {
        return memo;
    }
    return `${memo.slice(0, YNAB_MEMO_MAX_LENGTH - 1).trimEnd()}…`;
}
