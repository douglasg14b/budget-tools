/**
 * Bank charges often post 0–5 days after the Amazon payment; allow one day of negative slop.
 * Keep in sync with `amazonPaymentDateWindow` on the API.
 */
export function amazonSyncWindow(bankDate: string): { from: string; to: string } {
    return {
        from: addIsoDays(bankDate, -5),
        to: addIsoDays(bankDate, 1),
    };
}

export function addIsoDays(isoDate: string, days: number): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) {
        throw new Error(`Invalid ISO date: ${isoDate}`);
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
