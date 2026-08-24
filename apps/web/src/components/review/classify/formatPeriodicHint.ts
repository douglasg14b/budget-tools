import type { PeriodicMatchDto } from '@budget-tools/web-sdk';

import { humanizeEnum } from '../humanizeEnum';

export function formatPeriodicHint(match: PeriodicMatchDto, options: { readonly conflict: boolean }): string {
    const cadence = humanizeEnum(match.cadence);
    const times = `${match.occurrenceCount} times`;
    if (options.conflict) {
        return `${cadence} history is ${match.category} (${times}) — doesn't match this suggestion`;
    }

    if (!match.category) {
        return `${cadence} · ${times}`;
    }

    return `${cadence} · ${times} · ${match.category}`;
}

export function formatPeriodicBadgeLabel(match: PeriodicMatchDto): string {
    return `${humanizeEnum(match.cadence)} ×${match.occurrenceCount}`;
}

export function formatPeriodicSeriesCaption(match: PeriodicMatchDto, shownCount: number): string | undefined {
    if (shownCount >= match.occurrenceCount) {
        return undefined;
    }
    return `Showing ${shownCount} of ${match.occurrenceCount} prior charges`;
}
