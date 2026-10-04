import type { TransactionFlagColor } from 'ynab';

/** YNAB transaction `flag_color`. Kept as a literal union so tsoa can describe it. */
export type YnabFlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

/** Every YNAB flag color, in YNAB's display order. */
export const YNAB_FLAG_COLORS = [
    'red',
    'orange',
    'yellow',
    'green',
    'blue',
    'purple',
] as const satisfies readonly YnabFlagColor[] & readonly TransactionFlagColor[];

const FLAG_COLOR_SET: ReadonlySet<string> = new Set(YNAB_FLAG_COLORS);

export function isYnabFlagColor(value: unknown): value is YnabFlagColor {
    return typeof value === 'string' && FLAG_COLOR_SET.has(value);
}
