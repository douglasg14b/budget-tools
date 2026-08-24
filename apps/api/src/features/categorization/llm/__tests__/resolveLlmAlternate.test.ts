import { describe, expect, it } from 'vitest';

import type { RankedSimilarTransaction } from '../../pickSimilarTransactions';
import type { AssignableCategory } from '../nearbyCategories';
import { resolveLlmAlternate } from '../resolveLlmAlternate';

describe('resolveLlmAlternate', () => {
    const catalog: AssignableCategory[] = [
        { id: 'outing', name: 'Outing / Theater', groupName: 'Fun' },
        { id: 'coffee', name: 'Coffee', groupName: 'Everyday' },
        { id: 'vac-outing', name: 'Vacation - Outing', groupName: 'Vacation' },
        { id: 'vac-coffee', name: 'Vacation - Coffee', groupName: 'Vacation' },
        { id: 'vac-entertainment', name: 'Vacation - Entertainment', groupName: 'Vacation' },
    ];

    it('keeps a distinct predicted alternate', () => {
        expect(
            resolveLlmAlternate({
                catalog,
                primary: catalog[2]!,
                predictedAlternate: catalog[0]!,
                similar: [],
                travelWindow: vacationWindow(),
            })?.id,
        ).toBe('outing');
    });

    it('uses an everyday similar tx when the model omits an alternate on a trip', () => {
        expect(
            resolveLlmAlternate({
                catalog,
                primary: catalog[4]!,
                predictedAlternate: null,
                similar: [example('Outing / Theater', 'Fun')],
                travelWindow: vacationWindow(),
            })?.id,
        ).toBe('outing');
    });

    it('maps a vacation primary back to the everyday counterpart when similar txs are missing', () => {
        expect(
            resolveLlmAlternate({
                catalog,
                primary: catalog[3]!,
                predictedAlternate: null,
                similar: [],
                travelWindow: vacationWindow(),
            })?.id,
        ).toBe('coffee');
    });

    it('does not invent an alternate outside a trip window', () => {
        expect(
            resolveLlmAlternate({
                catalog,
                primary: catalog[3]!,
                predictedAlternate: null,
                similar: [example('Coffee', 'Everyday')],
                travelWindow: null,
            }),
        ).toBeNull();
    });
});

function vacationWindow(): NonNullable<Parameters<typeof resolveLlmAlternate>[0]['travelWindow']> {
    return {
        id: 'trip-1',
        name: 'DefCon',
        kind: 'vacation',
        targetCategory: null,
        location: 'Las Vegas',
        locationMatch: 'unspecified',
        merchantCity: null,
    };
}

function example(categoryName: string, categoryGroup: string): RankedSimilarTransaction {
    return {
        id: 'ex-1',
        date: '2026-07-01',
        amount: -14990,
        accountId: 'acct-1',
        payeeId: 'payee-1',
        payeeName: 'Meow Wolf',
        importPayeeNameOriginal: 'MEOW WOLF',
        memo: null,
        categoryName,
        categoryGroup,
        reason: 'payeeId',
    };
}
