import { Tooltip, UnstyledButton } from '@mantine/core';

import classes from './ClassifyProgress.module.css';
import { CLASSIFY_KEY_LABELS } from './classifyKeys';
import { CERTAIN_EXPLANATION } from './isCertainProposal';
import type { SessionTally } from './sessionDecisions';

type ClassifyProgressProps = {
    canGoNext?: boolean;
    canGoPrevious?: boolean;
    certainCount: number;
    completeHint: string;
    hasMore?: boolean;
    isExpanding?: boolean;
    itemCount: number;
    onAcceptAllCertain: () => void;
    onNext?: () => void;
    onPrevious?: () => void;
    position: number;
    tally: SessionTally;
};

export function ClassifyProgress({
    canGoNext = false,
    canGoPrevious = false,
    certainCount,
    completeHint,
    hasMore = false,
    isExpanding = false,
    itemCount,
    onAcceptAllCertain,
    onNext,
    onPrevious,
    position,
    tally,
}: ClassifyProgressProps) {
    const showStepper = Boolean(onNext && onPrevious);
    return (
        <div className={classes.progress}>
            <div className={classes.tallyRow}>
                <p className={classes.tally}>
                    {position} of {itemCount}
                    {tally.remaining > 0 ? ` · ${tally.remaining} left` : ''}
                    {tally.accepted > 0 ? ` · ${tally.accepted} accepted` : ''}
                    {tally.changed > 0 ? ` · ${tally.changed} changed` : ''}
                    {tally.rejected > 0 ? ` · ${tally.rejected} rejected` : ''}
                </p>
                {showStepper ? (
                    <div className={classes.stepper}>
                        <UnstyledButton
                            className={classes.step}
                            disabled={!canGoPrevious}
                            aria-label="Previous transaction"
                            onClick={onPrevious}
                        >
                            Prev
                        </UnstyledButton>
                        <UnstyledButton
                            className={classes.step}
                            disabled={!canGoNext}
                            aria-label="Next transaction"
                            onClick={onNext}
                        >
                            Next
                        </UnstyledButton>
                    </div>
                ) : null}
            </div>
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
                <p className={classes.completeCopy}>Loading more…</p>
            ) : tally.remaining === 0 && !hasMore ? (
                <p className={classes.completeCopy}>{completeHint}</p>
            ) : null}
        </div>
    );
}
