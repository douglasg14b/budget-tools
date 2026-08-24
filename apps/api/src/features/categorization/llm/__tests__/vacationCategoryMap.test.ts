import { describe, expect, it } from 'vitest';

import { mapEverydayCategory, mapVacationCategory } from '../vacationCategoryMap';

describe('mapVacationCategory', () => {
    const catalog = [
        { id: 'coffee', name: 'Coffee', groupName: 'Everyday' },
        { id: 'groceries', name: 'Groceries', groupName: 'Everyday' },
        { id: 'outing', name: 'Outing / Theater', groupName: 'Fun' },
        { id: 'pharmacy', name: 'Pharmacy', groupName: 'Everyday' },
        { id: 'vac-coffee', name: '🌴 Vacation - Coffee', groupName: 'Vacation' },
        { id: 'vac-food', name: 'Vacation - Food', groupName: 'Vacation' },
        { id: 'vac-outing', name: 'Vacation - Outing', groupName: 'Vacation' },
        { id: 'trips', name: '✈️ Trips + Vacations', groupName: 'Vacation' },
    ];

    it('maps Coffee to Vacation - Coffee by tail', () => {
        expect(mapVacationCategory('Coffee', catalog)?.id).toBe('vac-coffee');
    });

    it('maps Groceries to Vacation - Food via synonym', () => {
        expect(mapVacationCategory('Groceries', catalog)?.id).toBe('vac-food');
    });

    it('maps Outing / Theater to Vacation - Outing', () => {
        expect(mapVacationCategory('Outing / Theater', catalog)?.id).toBe('vac-outing');
    });

    it('maps Vacation - Coffee back to Coffee', () => {
        expect(mapEverydayCategory('🌴 Vacation - Coffee', catalog)?.id).toBe('coffee');
    });

    it('maps Vacation - Outing back to Outing / Theater', () => {
        expect(mapEverydayCategory('Vacation - Outing', catalog)?.id).toBe('outing');
    });

    it('returns the winner when it is already a vacation category', () => {
        expect(mapVacationCategory('🌴 Vacation - Coffee', catalog)?.id).toBe('vac-coffee');
    });

    it('does not map the trips savings category or unmatched tails', () => {
        expect(mapVacationCategory('✈️ Trips + Vacations', catalog)).toBeNull();
        expect(mapVacationCategory('Pharmacy', catalog)).toBeNull();
    });
});
