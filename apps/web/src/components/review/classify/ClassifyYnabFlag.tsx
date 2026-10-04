import type { YnabFlagColor } from '@budget-tools/web-sdk';
import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { IconFlagOff } from '@tabler/icons-react';

import classes from './ClassifyYnabFlag.module.css';
import type { YnabFlagOption } from './ynabFlagOptions';

type ClassifyYnabFlagProps = {
    disabled: boolean;
    onChange: (flagColor: YnabFlagColor | null) => void;
    options: readonly YnabFlagOption[];
    value: YnabFlagColor | null;
};

/**
 * YNAB transaction flag picker. Not the ML warning chips (`FlagChips`).
 */
export function ClassifyYnabFlag({ disabled, onChange, options, value }: ClassifyYnabFlagProps) {
    return (
        <fieldset className={classes.picker} disabled={disabled}>
            <legend className={classes.legend}>YNAB flag</legend>
            {options.map((option) => {
                const selected = option.color === value;
                return (
                    <Tooltip key={option.color} label={option.label}>
                        <UnstyledButton
                            aria-label={`${option.label} flag`}
                            aria-pressed={selected}
                            className={classes.swatch}
                            data-color={option.color}
                            data-selected={selected || undefined}
                            tabIndex={-1}
                            onClick={() => {
                                onChange(selected ? null : option.color);
                            }}
                        />
                    </Tooltip>
                );
            })}
            <Tooltip label="No flag">
                <ActionIcon
                    aria-label="Clear flag"
                    className={classes.clear}
                    disabled={disabled || value === null}
                    size="sm"
                    tabIndex={-1}
                    variant="subtle"
                    onClick={() => {
                        onChange(null);
                    }}
                >
                    <IconFlagOff size={15} />
                </ActionIcon>
            </Tooltip>
        </fieldset>
    );
}
