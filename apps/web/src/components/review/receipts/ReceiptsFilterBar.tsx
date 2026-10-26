import type { ReceiptBoundFilter } from '@budget-tools/web-sdk';
import { Select, UnstyledButton } from '@mantine/core';

import { QueueSearchInput } from '../QueueSearchInput';
import classes from './ReceiptsFilterBar.module.css';
import { isReceiptIssueFilter, RECEIPT_ISSUE_OPTIONS } from './receiptIssues';
import type { ReceiptsSearchState } from './receiptsSearchParams';

type ReceiptsFilterBarProps = {
    readonly compact?: boolean;
    readonly onChange: (patch: Partial<ReceiptsSearchState>) => void;
    readonly search: ReceiptsSearchState;
};

const BOUND_CHIPS = [
    { value: 'unbound', label: 'Unbound' },
    { value: 'bound', label: 'Bound' },
] as const satisfies readonly { value: ReceiptBoundFilter; label: string }[];

/**
 * Search box, chips, and a problem picker for the receipts inbox. Unbound and Bound are one choice;
 * a second tap clears it. Needs attention is the picker's "Any problem" as a one-tap chip.
 */
export function ReceiptsFilterBar({ compact = false, onChange, search }: ReceiptsFilterBarProps) {
    const needsAttention = search.issue === 'any';
    return (
        <div className={classes.bar} data-compact={compact || undefined}>
            <QueueSearchInput
                ariaLabel="Search receipts"
                compact={compact}
                placeholder="Vendor, item, amount, date…"
                value={search.q}
                onChange={(q) => {
                    onChange({ q });
                }}
            />
            <Select
                className={classes.issue}
                aria-label={compact ? 'Problem' : undefined}
                label={compact ? undefined : 'Problem'}
                clearable
                allowDeselect
                data={RECEIPT_ISSUE_OPTIONS}
                placeholder="Any status"
                value={search.issue ?? null}
                onChange={(value) => {
                    onChange({ issue: isReceiptIssueFilter(value) ? value : undefined });
                }}
            />
            <fieldset className={classes.chips}>
                <legend className={classes.srOnly}>Filter receipts</legend>
                <UnstyledButton
                    className={classes.chip}
                    data-chip="attention"
                    data-active={needsAttention || undefined}
                    aria-pressed={needsAttention}
                    onClick={() => {
                        onChange({ issue: needsAttention ? undefined : 'any' });
                    }}
                >
                    Needs attention
                </UnstyledButton>
                <UnstyledButton
                    className={classes.chip}
                    data-chip="reimbursable"
                    data-active={search.reimbursable || undefined}
                    aria-pressed={search.reimbursable}
                    onClick={() => {
                        onChange({ reimbursable: !search.reimbursable });
                    }}
                >
                    Reimbursable
                </UnstyledButton>
                {BOUND_CHIPS.map((chip) => {
                    const active = search.bound === chip.value;
                    return (
                        <UnstyledButton
                            key={chip.value}
                            className={classes.chip}
                            data-chip={chip.value}
                            data-active={active || undefined}
                            aria-pressed={active}
                            onClick={() => {
                                onChange({ bound: active ? undefined : chip.value });
                            }}
                        >
                            {chip.label}
                        </UnstyledButton>
                    );
                })}
            </fieldset>
        </div>
    );
}
