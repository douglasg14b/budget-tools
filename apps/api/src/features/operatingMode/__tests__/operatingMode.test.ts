import { describe, expect, it } from 'vitest';

import { QueryValidationError } from '../../categorization/filterQueue';
import { HttpError } from '../../travelWindows/HttpError';
import { assertYnabWritesAllowed, parseOperatingMode, ynabWritesEnabled } from '../operatingMode';

describe('operatingMode', () => {
    it('parses practice and live', () => {
        expect(parseOperatingMode('practice')).toBe('practice');
        expect(parseOperatingMode('live')).toBe('live');
    });

    it('rejects anything else', () => {
        expect(() => parseOperatingMode('test')).toThrow(QueryValidationError);
        expect(() => parseOperatingMode('')).toThrow(QueryValidationError);
    });

    it('enables YNAB writes only in live', () => {
        expect(ynabWritesEnabled('practice')).toBe(false);
        expect(ynabWritesEnabled('live')).toBe(true);
        expect(() => assertYnabWritesAllowed('live')).not.toThrow();
    });

    it('refuses YNAB writes in practice with 403', () => {
        let thrown: unknown;
        try {
            assertYnabWritesAllowed('practice');
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(HttpError);
        expect(thrown).toMatchObject({ statusCode: 403 });
    });
});
