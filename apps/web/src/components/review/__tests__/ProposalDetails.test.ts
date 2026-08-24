import type { TravelWindowHitDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { formatTravelHit } from '../ProposalDetails';

describe('formatTravelHit', () => {
    it('shows trip name, kind, destination, city evidence, and target category', () => {
        const hit: TravelWindowHitDto = {
            id: 'trip-1',
            name: 'Nashville',
            kind: 'vacation',
            targetCategory: 'Vacation - Coffee',
            location: 'Nashville',
            locationMatch: 'mismatch',
            merchantCity: 'SEATTLE',
        };

        expect(formatTravelHit(hit)).toBe(
            'Nashville · Vacation · destination Nashville · merchant city SEATTLE · city does not match destination · option Vacation - Coffee',
        );
    });

    it('describes unspecified membership without city evidence', () => {
        const hit: TravelWindowHitDto = {
            id: 'trip-1',
            name: 'Hawaii',
            kind: 'work',
            targetCategory: 'Transient / Reimbursable',
            location: null,
            locationMatch: 'unspecified',
            merchantCity: null,
        };

        expect(formatTravelHit(hit)).toBe(
            'Hawaii · Work trip · in window by date and card · option Transient / Reimbursable',
        );
    });
});
