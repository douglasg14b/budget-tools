import type { TransactionDetailDto, YnabFlagColor, YnabFlagDto } from '@budget-tools/web-sdk';

/** YNAB's display order. */
export const YNAB_FLAG_COLORS: readonly YnabFlagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export type YnabFlagOption = {
    readonly color: YnabFlagColor;
    readonly label: string;
};

/**
 * Picker options in YNAB order, labelled with the user's YNAB flag name. Falls back to the
 * transaction's own flag name for its color (flags still loading), then the color name.
 */
export function ynabFlagOptions(
    flags: readonly YnabFlagDto[] | undefined,
    transaction: Pick<TransactionDetailDto, 'flagColor' | 'flagName'>,
): YnabFlagOption[] {
    const names = new Map(flags?.map((flag) => [flag.color, flag.name?.trim()]));
    return YNAB_FLAG_COLORS.map((color) => ({
        color,
        label:
            names.get(color) ||
            (color === transaction.flagColor ? transaction.flagName?.trim() : undefined) ||
            capitalize(color),
    }));
}

export function ynabFlagLabel(options: readonly YnabFlagOption[], color: YnabFlagColor): string {
    return options.find((option) => option.color === color)?.label ?? capitalize(color);
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
