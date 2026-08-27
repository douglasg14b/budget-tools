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

/** UTC calendar day for `now`. */
export function utcTodayIso(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

const PAYMENT_INDEX_LOOKBACK_DAYS = 5;

/**
 * Payment scrape window: oldest uncategorized Amazon bank day (minus match lookback)
 * through today, unioned with the classify `{from, to}`.
 */
export function amazonPaymentIndexRange(input: {
    readonly requested: IsoDateRange;
    readonly oldestUncategorizedDate: string | null;
    readonly today: string;
}): IsoDateRange {
    const oldestStart =
        input.oldestUncategorizedDate && isIsoDate(input.oldestUncategorizedDate)
            ? addIsoDays(input.oldestUncategorizedDate, -PAYMENT_INDEX_LOOKBACK_DAYS)
            : input.requested.start;
    const start = oldestStart < input.requested.start ? oldestStart : input.requested.start;
    const end = input.today > input.requested.end ? input.today : input.requested.end;
    return { start, end };
}

/** One Your Payments walk from the oldest uncovered day through the index end. */
export function paymentScrapeRange(gaps: readonly IsoDateRange[], indexEnd: string): IsoDateRange | null {
    const oldestGap = gaps[0];
    if (!oldestGap) {
        return null;
    }
    return { start: oldestGap.start, end: indexEnd };
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

export function coveredRangeFromScrapedPayments(
    requested: IsoDateRange,
    paymentDates: readonly string[],
    paginationComplete: boolean,
): IsoDateRange | null {
    if (paginationComplete) {
        return requested;
    }
    const inRange = paymentDates
        .filter((date) => isIsoDate(date) && date >= requested.start && date <= requested.end)
        .sort((left, right) => left.localeCompare(right));
    const oldest = inRange[0];
    if (!oldest) {
        return null;
    }
    // Newest-first walk: every day from this payment through `requested.end` was on a visited page.
    return { start: oldest, end: requested.end };
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
