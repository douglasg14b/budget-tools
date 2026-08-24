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

export function travelWindowChipLabel(window: TravelWindowHitDto | null | undefined): string {
    if (!window) {
        return 'During trip';
    }
    if (window.locationMatch === 'mismatch') {
        return `During ${window.name}`;
    }
    return window.kind === 'work' ? 'Work trip' : 'Vacation';
}

export function travelWindowTooltip(window: TravelWindowHitDto): string {
    const parts = [window.name, window.kind === 'work' ? 'Work' : 'Vacation'];
    if (window.location) {
        parts.push(`destination ${window.location}`);
    }
    if (window.merchantCity) {
        parts.push(`merchant ${window.merchantCity}`);
    }
    if (window.locationMatch === 'match') {
        parts.push('city matches');
    }
    if (window.locationMatch === 'mismatch') {
        parts.push('city does not match');
    }
    return parts.join(' · ');
}

export function TravelWindowChip({ travelWindow }: { travelWindow: TravelWindowHitDto }) {
    const mismatch = travelWindow.locationMatch === 'mismatch';
    return (
        <Tooltip label={travelWindowTooltip(travelWindow)}>
            <span
                className={
                    mismatch ? `${classes.chip} ${classes.chipTravelMismatch}` : `${classes.chip} ${classes.chipTravel}`
                }
            >
                {travelWindowChipLabel(travelWindow)}
            </span>
        </Tooltip>
    );
}

export function FlagChips({ flags, hide = [], travelWindow }: FlagChipsProps) {
    const hidden = new Set(hide);
    const active = FLAG_CHIPS.filter(([key]) => flags[key] && !hidden.has(key));
    const showTravel = Boolean(travelWindow) || flags.isTravelWindow;
    if (active.length === 0 && !showTravel) {
        return null;
    }

    return (
        <span className={classes.flags}>
            {travelWindow ? <TravelWindowChip travelWindow={travelWindow} /> : null}
            {!travelWindow && flags.isTravelWindow ? (
                <span className={`${classes.chip} ${classes.chipTravel}`}>{travelWindowChipLabel(null)}</span>
            ) : null}
            {active.map(([key, label, explanation]) => (
                <Tooltip key={key} label={explanation}>
                    <span className={classes.chip}>{label}</span>
                </Tooltip>
            ))}
        </span>
    );
}
