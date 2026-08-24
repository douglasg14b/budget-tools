import type { TravelWindowHitDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { travelWindowChipLabel, travelWindowTooltip } from '../FlagChips';

describe('travelWindowChipLabel', () => {
    it('uses Vacation / Work trip when steering applied', () => {
        expect(travelWindowChipLabel(hit({ kind: 'vacation', locationMatch: 'match' }))).toBe('Vacation');
        expect(travelWindowChipLabel(hit({ kind: 'work', locationMatch: 'unspecified' }))).toBe('Work trip');
    });

    it('uses During {name} when membership is true but the city does not match', () => {
        expect(travelWindowChipLabel(hit({ name: 'Nashville', locationMatch: 'mismatch' }))).toBe('During Nashville');
    });
});

describe('travelWindowTooltip', () => {
    it('includes the trip name and a readable kind', () => {
        expect(travelWindowTooltip(hit({ name: 'Hawaii', kind: 'vacation' }))).toBe('Hawaii · Vacation');
        expect(travelWindowTooltip(hit({ name: 'Austin client week', kind: 'work' }))).toBe(
            'Austin client week · Work',
        );
    });

    it('includes destination and merchant city when present', () => {
        expect(
            travelWindowTooltip(
                hit({
                    name: 'Nashville',
                    location: 'Nashville',
                    merchantCity: 'SEATTLE',
                    locationMatch: 'mismatch',
                }),
            ),
        ).toBe('Nashville · Vacation · destination Nashville · merchant SEATTLE · city does not match');
    });
});

function hit(overrides: Partial<TravelWindowHitDto> = {}): TravelWindowHitDto {
    return {
        id: 'trip-1',
        name: 'Hawaii',
        kind: 'vacation',
        targetCategory: 'Vacation - Coffee',
        location: null,
        locationMatch: 'unspecified',
        merchantCity: null,
        ...overrides,
    };
}
