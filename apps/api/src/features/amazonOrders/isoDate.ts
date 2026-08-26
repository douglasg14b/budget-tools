const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type IsoDateRange = {
    readonly start: string;
    readonly end: string;
};

export function isIsoDate(value: string): boolean {
    return ISO_DATE.test(value);
}

export function addIsoDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

export function mergeIsoDateRanges(ranges: readonly IsoDateRange[]): IsoDateRange[] {
    const sorted = [...ranges]
        .filter((range) => range.start <= range.end)
        .sort((left, right) => left.start.localeCompare(right.start));
    const merged: IsoDateRange[] = [];
    for (const range of sorted) {
        const last = merged.at(-1);
        if (!last) {
            merged.push(range);
            continue;
        }
        if (addIsoDays(last.end, 1) >= range.start) {
            merged[merged.length - 1] = {
                start: last.start,
                end: last.end > range.end ? last.end : range.end,
            };
            continue;
        }
        merged.push(range);
    }
    return merged;
}

export function uncoveredIsoDateRanges(covered: readonly IsoDateRange[], requested: IsoDateRange): IsoDateRange[] {
    if (requested.start > requested.end) {
        return [];
    }

    const overlapping = mergeIsoDateRanges(covered)
        .filter((range) => range.end >= requested.start && range.start <= requested.end)
        .map((range) => ({
            start: range.start < requested.start ? requested.start : range.start,
            end: range.end > requested.end ? requested.end : range.end,
        }));

    const gaps: IsoDateRange[] = [];
    let cursor = requested.start;
    for (const block of overlapping) {
        if (cursor < block.start) {
            gaps.push({ start: cursor, end: addIsoDays(block.start, -1) });
        }
        cursor = addIsoDays(block.end, 1);
    }
    if (cursor <= requested.end) {
        gaps.push({ start: cursor, end: requested.end });
    }
    return gaps;
}
