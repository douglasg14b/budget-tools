/**
 * Formats a `YYYY-MM-DD` transaction date in en-US without UTC shifting.
 */
export function formatTransactionDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
