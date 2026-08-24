const USD_FORMAT = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Formats a YNAB milliunit amount as a USD string (`$12.34`, `-$12.34`).
 */
export function formatYnabAmount(milliunits: number): string {
    const dollars = milliunits / 1000;
    const formatted = USD_FORMAT.format(Math.abs(dollars));
    return dollars < 0 ? `-$${formatted}` : `$${formatted}`;
}
