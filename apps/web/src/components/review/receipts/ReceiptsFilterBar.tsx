import type { ReceiptBoundFilter } from '@budget-tools/web-sdk';
import { UnstyledButton } from '@mantine/core';

import { QueueSearchInput } from '../QueueSearchInput';
import classes from './ReceiptsFilterBar.module.css';
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

/** Search box and chips for the receipts inbox. Unbound and Bound are one choice; a second tap clears it. */
export function ReceiptsFilterBar({ compact = false, onChange, search }: ReceiptsFilterBarProps) {
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
            <fieldset className={classes.chips}>
                <legend className={classes.srOnly}>Filter receipts</legend>
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
