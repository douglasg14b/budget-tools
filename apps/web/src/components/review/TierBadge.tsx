import type { ApprovalTier } from '@budget-tools/web-sdk';
import { Tooltip } from '@mantine/core';

import { APPROVAL_TIER_EXPLANATIONS } from './approvalTierCopy';
import { humanizeEnum } from './humanizeEnum';
import classes from './TierBadge.module.css';

type TierBadgeProps = {
    tier: ApprovalTier;
};

export function TierBadge({ tier }: TierBadgeProps) {
    const label = humanizeEnum(tier);
    const explanation = APPROVAL_TIER_EXPLANATIONS[tier];

    return (
        <Tooltip label={explanation}>
            <span className={classes.badge} data-tier={tier}>
                {label}
            </span>
        </Tooltip>
    );
}
