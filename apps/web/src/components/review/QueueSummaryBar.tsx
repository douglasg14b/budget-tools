import type { ApprovalTier, QueueSummaryDto } from '@budget-tools/web-sdk';
import { Tooltip, UnstyledButton } from '@mantine/core';

import { APPROVAL_TIER_EXPLANATIONS } from './approvalTierCopy';
import { CERTAIN_EXPLANATION } from './classify/isCertainProposal';
import { humanizeEnum } from './humanizeEnum';
import classes from './QueueSummaryBar.module.css';
import { APPROVAL_TIERS } from './queueSearchParams';

type QueueSummaryBarProps = {
    certainCount: number;
    onToggleTier: (tier: ApprovalTier) => void;
    pendingCount: number;
    selectedTiers: ApprovalTier[] | undefined;
    summary: QueueSummaryDto;
};

const TIER_COUNT_KEY = {
    AutoApply: 'autoApply',
    Suggested: 'suggested',
    Review: 'review',
    Blocked: 'blocked',
} as const satisfies Record<ApprovalTier, keyof QueueSummaryDto>;

export function QueueSummaryBar({
    certainCount,
    onToggleTier,
    pendingCount,
    selectedTiers,
    summary,
}: QueueSummaryBarProps) {
    return (
        <div className={classes.bar}>
            <p className={classes.pending}>
                {queueCountLabel(summary.total, pendingCount)}
                {certainCount > 0 ? (
                    <>
                        {' · '}
                        <Tooltip label={CERTAIN_EXPLANATION}>
                            <span className={classes.certainHint}>{formatCount(certainCount)} certain</span>
                        </Tooltip>
                    </>
                ) : null}
            </p>
            <fieldset className={classes.instrument}>
                <legend className={classes.legend}>Filter by approval tier</legend>
                {APPROVAL_TIERS.map((tier) => {
                    const isActive = selectedTiers === undefined ? false : selectedTiers.includes(tier);
                    const label = humanizeEnum(tier);
                    const explanation = APPROVAL_TIER_EXPLANATIONS[tier];
                    return (
                        <Tooltip key={tier} label={explanation}>
                            <UnstyledButton
                                className={isActive ? `${classes.chip} ${classes.chipActive}` : classes.chip}
                                data-tier={tier}
                                aria-pressed={isActive}
                                onClick={() => {
                                    onToggleTier(tier);
                                }}
                            >
                                <span className={classes.label}>{label}</span>
                                <span className={classes.count}>{summary[TIER_COUNT_KEY[tier]]}</span>
                            </UnstyledButton>
                        </Tooltip>
                    );
                })}
            </fieldset>
        </div>
    );
}

function queueCountLabel(scoredCount: number, pendingCount: number): string {
    const scored = formatCount(scoredCount);
    if (pendingCount <= scoredCount) {
        return `${scored} pending`;
    }
    return `${scored} scored · ${formatCount(pendingCount)} pending`;
}

function formatCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}
