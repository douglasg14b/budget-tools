import { Tooltip, UnstyledButton } from '@mantine/core';

import classes from './ClassifyProgress.module.css';
import { CLASSIFY_KEY_LABELS } from './classifyKeys';
import { CERTAIN_EXPLANATION } from './isCertainProposal';
import type { SessionTally } from './sessionDecisions';

type ClassifyProgressProps = {
    certainCount: number;
    completeHint: string;
    hasMore?: boolean;
    isExpanding?: boolean;
    itemCount: number;
    onAcceptAllCertain: () => void;
    position: number;
    tally: SessionTally;
};

export function ClassifyProgress({
    certainCount,
    completeHint,
    hasMore = false,
    isExpanding = false,
    itemCount,
    onAcceptAllCertain,
    position,
    tally,
}: ClassifyProgressProps) {
    return (
        <div className={classes.progress}>
            <p className={classes.tally}>
                {position} of {itemCount}
                {tally.remaining > 0 ? ` · ${tally.remaining} left` : ''}
                {tally.accepted > 0 ? ` · ${tally.accepted} accepted` : ''}
                {tally.changed > 0 ? ` · ${tally.changed} changed` : ''}
                {tally.rejected > 0 ? ` · ${tally.rejected} rejected` : ''}
            </p>
            <div className={classes.track} aria-hidden="true">
                <span
                    className={classes.fill}
                    style={{ width: `${itemCount === 0 ? 0 : (tally.decided / itemCount) * 100}%` }}
                />
            </div>
            {certainCount > 0 ? (
                <p className={classes.certainLine}>
                    <Tooltip label={CERTAIN_EXPLANATION}>
                        <span className={classes.certainHint}>{certainCount} certain</span>
                    </Tooltip>
                    <UnstyledButton className={classes.certainAction} onClick={onAcceptAllCertain}>
                        Accept all
                        <kbd className={classes.kbd}>{CLASSIFY_KEY_LABELS.acceptAllCertain}</kbd>
                    </UnstyledButton>
                </p>
            ) : null}
            {isExpanding ? (
                <p className={classes.completeCopy}>Scoring the next batch…</p>
            ) : tally.remaining === 0 && !hasMore ? (
                <p className={classes.completeCopy}>{completeHint}</p>
            ) : null}
        </div>
    );
}
