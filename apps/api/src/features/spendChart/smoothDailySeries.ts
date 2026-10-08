/**
 * Spreads each day's spend evenly over `windowDays` days starting that day.
 *
 * $100 of groceries bought on Monday with a 7-day window becomes ~$14.29/day Monday through
 * Sunday; overlapping purchases add up. That is the same as a trailing `windowDays`-day sum
 * divided by `windowDays`, which is how it is computed. `windowDays` of 1 returns the series
 * unchanged.
 *
 * `daily` must hold one value per consecutive day and begin at least `windowDays - 1` days
 * before the first day the caller keeps; the leading days are only there so purchases made
 * just before the visible range still spill into it.
 */
export function smoothDailySeries(daily: readonly number[], windowDays: number): number[] {
    if (!Number.isInteger(windowDays) || windowDays < 1) {
        throw new RangeError(`windowDays must be a positive integer, got ${windowDays}`);
    }
    if (windowDays === 1) {
        return [...daily];
    }

    const smoothed: number[] = [];
    let runningSum = 0;
    for (let index = 0; index < daily.length; index++) {
        runningSum += daily[index] ?? 0;
        if (index >= windowDays) {
            runningSum -= daily[index - windowDays] ?? 0;
        }
        smoothed.push(runningSum / windowDays);
    }
    return smoothed;
}
