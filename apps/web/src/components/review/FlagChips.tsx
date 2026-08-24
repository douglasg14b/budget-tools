import type { CategorizationFlagsDto, TravelWindowHitDto } from '@budget-tools/web-sdk';
import { Tooltip } from '@mantine/core';

import classes from './FlagChips.module.css';

const FLAG_CHIPS = [
    [
        'isAmbiguous',
        'Ambiguous',
        'This payee has been filed under different categories before, so history is not a reliable guide.',
    ],
    ['isNovelImport', 'Novel import', "The bank's original payee name has not shown up in your history yet."],
    [
        'isExcluded',
        'Excluded',
        'This payee or check is skipped for automatic categorization. Assign a category yourself.',
    ],
    [
        'requiresManualReview',
        'Manual review',
        'The model is not confident enough to apply this automatically. Confirm or pick a category.',
    ],
    ['isPeriodic', 'Periodic', 'This looks like a repeating charge — same cadence and a similar amount.'],
    [
        'isPeriodicConflict',
        'Periodic conflict',
        'This matches a repeating series, but that series uses a different category than this suggestion.',
    ],
] as const satisfies ReadonlyArray<readonly [keyof CategorizationFlagsDto, string, string]>;

type FlagChipsProps = {
    flags: CategorizationFlagsDto;
    hide?: ReadonlyArray<keyof CategorizationFlagsDto>;
    travelWindow?: TravelWindowHitDto | null;
};

export function travelWindowTooltip(window: Pick<TravelWindowHitDto, 'name' | 'kind'>): string {
    const kindLabel = window.kind === 'work' ? 'Work' : 'Vacation';
    return `${window.name} · ${kindLabel}`;
}

export function FlagChips({ flags, hide = [], travelWindow }: FlagChipsProps) {
    const hidden = new Set(hide);
    const active = FLAG_CHIPS.filter(([key]) => flags[key] && !hidden.has(key));
    if (active.length === 0 && !travelWindow) {
        return null;
    }

    return (
        <span className={classes.flags}>
            {travelWindow ? (
                <Tooltip label={travelWindowTooltip(travelWindow)}>
                    <span className={`${classes.chip} ${classes.chipTravel}`}>
                        {travelWindow.kind === 'work' ? 'Work trip' : 'Vacation'}
                    </span>
                </Tooltip>
            ) : null}
            {active.map(([key, label, explanation]) => (
                <Tooltip key={key} label={explanation}>
                    <span className={classes.chip}>{label}</span>
                </Tooltip>
            ))}
        </span>
    );
}
