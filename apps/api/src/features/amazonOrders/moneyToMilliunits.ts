/**
 * Converts Amazon MCP money (major currency units) to YNAB milliunits.
 */
export function moneyToMilliunits(value: unknown): number | null {
    const dollars = moneyToMajorUnits(value);
    if (dollars == null) {
        return null;
    }
    return Math.round(dollars * 1000);
}

function moneyToMajorUnits(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const digits = value.replace(/[^0-9.+-]/g, '');
        if (!digits || digits === '+' || digits === '-' || digits === '.') {
            return null;
        }
        const parsed = Number(digits);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.amount === 'number' && Number.isFinite(record.amount)) {
        return record.amount;
    }
    if (typeof record.amount === 'string') {
        return moneyToMajorUnits(record.amount);
    }
    return null;
}
