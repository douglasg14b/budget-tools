import { QueryValidationError } from '../categorization/filterQueue';
import { HttpError } from '../travelWindows/HttpError';

export type OperatingMode = 'practice' | 'live';

export function isOperatingMode(value: string): value is OperatingMode {
    return value === 'practice' || value === 'live';
}

/**
 * Parses a stored or requested operating mode. Invalid values fail loud.
 */
export function parseOperatingMode(value: string): OperatingMode {
    if (isOperatingMode(value)) {
        return value;
    }
    throw new QueryValidationError("mode must be 'practice' or 'live'");
}

export function ynabWritesEnabled(mode: OperatingMode): boolean {
    return mode === 'live';
}

/**
 * Call from YNAB write endpoints before mutating YNAB or enqueueing outbound sync.
 */
export function assertYnabWritesAllowed(mode: OperatingMode): void {
    if (ynabWritesEnabled(mode)) {
        return;
    }
    throw new HttpError(403, 'YNAB writes are disabled in practice mode');
}
