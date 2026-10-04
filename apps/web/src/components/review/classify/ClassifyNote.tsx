import type { YnabFlagColor } from '@budget-tools/web-sdk';
import { Textarea } from '@mantine/core';
import classes from './ClassifyNote.module.css';
import { ClassifyYnabFlag } from './ClassifyYnabFlag';
import { YNAB_MEMO_MAX_LENGTH } from './decisionNote';
import type { DisplayedNote } from './noteDrafts';
import type { YnabFlagOption } from './ynabFlagOptions';

type ClassifyNoteProps = {
    flagOptions: readonly YnabFlagOption[];
    note: DisplayedNote;
    onChangeFlag: (flagColor: YnabFlagColor | null) => void;
    onChangeMemo: (memo: string) => void;
    /** Decided cards show the decision's memo / flag; undo to edit. */
    readOnly: boolean;
};

/**
 * Parent memo and YNAB flag, sent with the next decision on this transaction.
 */
export function ClassifyNote({ flagOptions, note, onChangeFlag, onChangeMemo, readOnly }: ClassifyNoteProps) {
    return (
        <div className={classes.note}>
            {readOnly ? (
                <p className={classes.memoText}>{note.memo}</p>
            ) : (
                <Textarea
                    aria-label="Memo"
                    autosize
                    className={classes.memo}
                    maxLength={YNAB_MEMO_MAX_LENGTH}
                    maxRows={4}
                    minRows={1}
                    placeholder="Add a note…"
                    size="sm"
                    value={note.memo}
                    onChange={(event) => {
                        onChangeMemo(event.currentTarget.value);
                    }}
                />
            )}
            <ClassifyYnabFlag
                disabled={readOnly}
                options={flagOptions}
                value={note.flagColor}
                onChange={onChangeFlag}
            />
        </div>
    );
}
