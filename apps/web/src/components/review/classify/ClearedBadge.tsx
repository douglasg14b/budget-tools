import type { TransactionClearedStatus } from '@budget-tools/web-sdk';
import { Tooltip } from '@mantine/core';

import classes from './ClearedBadge.module.css';

type ClearedBadgeProps = {
    cleared: TransactionClearedStatus;
};

export function ClearedBadge({ cleared }: ClearedBadgeProps) {
    if (cleared !== 'uncleared') {
        return null;
    }

    return (
        <Tooltip label="This transaction has not cleared your bank yet. Approving it now may not match once it settles.">
            <span className={classes.badge}>Not cleared</span>
        </Tooltip>
    );
}
