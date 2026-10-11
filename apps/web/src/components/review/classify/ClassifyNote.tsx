import type { YnabFlagColor } from '@budget-tools/web-sdk';
import { Textarea } from '@mantine/core';
import classes from './ClassifyNote.module.css';
import { ClassifyYnabFlag } from './ClassifyYnabFlag';
import { YNAB_MEMO_MAX_LENGTH } from './decisionNote';
import type { DisplayedNote } from './noteDrafts';
import type { YnabFlagOption } from './ynabFlagOptions';

type ClassifyNoteProps = {
    flagOptions: readonly YnabFlagOption[];
    /** Focus the memo box as it appears, i.e. right after "Add note". */
    focusMemo: boolean;
    /** Show the memo box. Closed, only the flags remain and "Add note" opens it. */
    memoOpen: boolean;
    note: DisplayedNote;
    onChangeFlag: (flagColor: YnabFlagColor | null) => void;
    onChangeMemo: (memo: string) => void;
    onMemoBlur: () => void;
    /** Decided cards show the decision's memo / flag; undo to edit. */
    readOnly: boolean;
};

/**
 * Parent memo and YNAB flag, sent with the next decision on this transaction.
 */
export function ClassifyNote({
    flagOptions,
    focusMemo,
    memoOpen,
    note,
    onChangeFlag,
    onChangeMemo,
    onMemoBlur,
    readOnly,
}: ClassifyNoteProps) {
    return (
        <div className={classes.note}>
            {readOnly ? (
                note.memo ? (
                    <p className={classes.memoText}>{note.memo}</p>
                ) : null
            ) : memoOpen ? (
                <Textarea
                    aria-label="Memo"
                    autosize
                    // Only focuses right after an explicit "Add note" tap, never on page load.
                    autoFocus={focusMemo}
                    className={classes.memo}
                    maxLength={YNAB_MEMO_MAX_LENGTH}
                    maxRows={4}
                    minRows={1}
                    placeholder="Add a note…"
                    size="sm"
                    value={note.memo}
                    onBlur={onMemoBlur}
                    onChange={(event) => {
                        onChangeMemo(event.currentTarget.value);
                    }}
                />
            ) : null}
            <ClassifyYnabFlag
                disabled={readOnly}
                options={flagOptions}
                value={note.flagColor}
                onChange={onChangeFlag}
            />
        </div>
    );
}
