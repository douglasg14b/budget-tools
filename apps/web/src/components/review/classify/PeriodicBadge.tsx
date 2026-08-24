import type { PeriodicMatchDto, TransactionDetailDto } from '@budget-tools/web-sdk';
import { Tooltip } from '@mantine/core';
import { useState } from 'react';

import { formatPeriodicBadgeLabel, formatPeriodicHint } from './formatPeriodicHint';
import classes from './PeriodicBadge.module.css';
import { PeriodicSeriesModal } from './PeriodicSeriesModal';

type PeriodicBadgeProps = {
    conflict: boolean;
    current: TransactionDetailDto;
    match: PeriodicMatchDto;
    relatedTransactions: readonly TransactionDetailDto[];
};

export function PeriodicBadge({ conflict, current, match, relatedTransactions }: PeriodicBadgeProps) {
    const [opened, setOpened] = useState(false);
    const hint = formatPeriodicHint(match, { conflict });

    return (
        <>
            <Tooltip label={hint}>
                <button
                    type="button"
                    className={classes.badge}
                    data-conflict={conflict || undefined}
                    aria-expanded={opened}
                    aria-haspopup="dialog"
                    aria-label={`View ${formatPeriodicBadgeLabel(match)} series. ${hint}`}
                    onClick={() => {
                        setOpened(true);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                            event.stopPropagation();
                        }
                    }}
                >
                    {formatPeriodicBadgeLabel(match)}
                </button>
            </Tooltip>
            <PeriodicSeriesModal
                conflict={conflict}
                current={current}
                match={match}
                opened={opened}
                relatedTransactions={relatedTransactions}
                onClose={() => {
                    setOpened(false);
                }}
            />
        </>
    );
}
