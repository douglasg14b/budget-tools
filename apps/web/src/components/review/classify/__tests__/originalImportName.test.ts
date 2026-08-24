import { describe, expect, it } from 'vitest';

import { originalImportName } from '../originalImportName';

describe('originalImportName', () => {
    it('prefers the bank import string', () => {
        expect(
            originalImportName({
                importPayeeNameOriginal: 'CRUNCHYROLL * 415-503-9235 CA',
                importPayeeName: 'Crunchyroll',
            }),
        ).toBe('CRUNCHYROLL * 415-503-9235 CA');
    });

    it('falls back to the cleaned import name', () => {
        expect(
            originalImportName({
                importPayeeNameOriginal: null,
                importPayeeName: 'Crunchyroll',
            }),
        ).toBe('Crunchyroll');
    });

    it('returns null when both names are empty', () => {
        expect(
            originalImportName({
                importPayeeNameOriginal: '  ',
                importPayeeName: null,
            }),
        ).toBeNull();
    });
});
