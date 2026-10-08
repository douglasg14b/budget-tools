/** Categorical series colors, validated against the app surfaces (dark `#1f201a`, light `#faf7f0`). */
export const SERIES_COLORS = {
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
} as const;

export const MAX_CHARTED = SERIES_COLORS.dark.length;
export const DEFAULT_CHARTED = 5;

export type SpendRangeDays = 30 | 90 | 180 | 365;

export type ChartRow = { day: string; label: string } & Record<string, number | string>;

type SeriesSource = {
    readonly categoryId: string;
    readonly dailyMilliunits: readonly number[];
};

/** First day of a range of `days` days ending on (and including) `endIso`. */
export function rangeStart(endIso: string, days: number): string {
    const end = Date.parse(`${endIso}T00:00:00Z`);
    return new Date(end - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Gives each charted category a color slot that it keeps while it stays charted, so toggling
 * one category never repaints the others. New categories take the lowest free slot.
 */
export function assignColorSlots(
    previous: ReadonlyMap<string, number>,
    charted: readonly string[],
): Map<string, number> {
    const slots = new Map<string, number>();
    for (const id of charted) {
        const slot = previous.get(id);
        if (slot !== undefined) {
            slots.set(id, slot);
        }
    }
    const taken = new Set(slots.values());
    for (const id of charted) {
        if (slots.has(id)) {
            continue;
        }
        let slot = 0;
        while (taken.has(slot)) {
            slot++;
        }
        slots.set(id, slot);
        taken.add(slot);
    }
    return slots;
}

/** One row per day with a dollar value per charted category, keyed by category id. */
export function buildChartRows(
    days: readonly string[],
    categories: readonly SeriesSource[],
    charted: readonly string[],
    formatDay: (day: string) => string,
): ChartRow[] {
    const chartedSet = new Set(charted);
    const series = categories.filter((category) => chartedSet.has(category.categoryId));
    return days.map((day, index) => {
        const row: ChartRow = { day, label: formatDay(day) };
        for (const category of series) {
            row[category.categoryId] = (category.dailyMilliunits[index] ?? 0) / 1000;
        }
        return row;
    });
}

/**
 * The saved chart selection, minus categories not in the current data. With nothing saved yet,
 * the largest categories; an emptied selection stays empty.
 */
export function resolveCharted(saved: readonly string[] | null, available: readonly string[]): string[] {
    if (saved === null) {
        return available.slice(0, DEFAULT_CHARTED);
    }
    const availableSet = new Set(available);
    return saved.filter((id) => availableSet.has(id)).slice(0, MAX_CHARTED);
}
