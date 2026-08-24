import { describe, expect, it } from 'vitest';

import { overlayFingerprint, TRAVEL_BIAS_OFF_SIGNATURE, travelWindowsSignature } from '../travelWindowsSignature';

describe('travelWindowsSignature', () => {
    it('returns the off sentinel when bias is disabled, ignoring window edits', () => {
        const offEmpty = travelWindowsSignature({ enabled: false, windows: [] });
        const offEdited = travelWindowsSignature({
            enabled: false,
            windows: [
                {
                    id: 'w1',
                    kind: 'vacation',
                    startDate: '2026-07-01',
                    endDate: '2026-07-10',
                    location: 'Nashville',
                    accountIds: ['card-a'],
                },
            ],
        });
        expect(offEmpty).toBe(TRAVEL_BIAS_OFF_SIGNATURE);
        expect(offEdited).toBe(TRAVEL_BIAS_OFF_SIGNATURE);
    });

    it('hashes window identity when bias is on', () => {
        const windows = [
            {
                id: 'w1',
                kind: 'vacation' as const,
                startDate: '2026-07-01',
                endDate: '2026-07-10',
                location: null,
                accountIds: [] as string[],
            },
        ];
        const first = travelWindowsSignature({ enabled: true, windows });
        const same = travelWindowsSignature({ enabled: true, windows: [...windows] });
        const changed = travelWindowsSignature({
            enabled: true,
            windows: [{ ...windows[0]!, endDate: '2026-07-12' }],
        });
        expect(first).toBe(same);
        expect(first).not.toBe(TRAVEL_BIAS_OFF_SIGNATURE);
        expect(changed).not.toBe(first);
    });

    it('changes when location or account ids change', () => {
        const base = {
            id: 'w1',
            kind: 'vacation' as const,
            startDate: '2026-07-01',
            endDate: '2026-07-10',
            location: 'Nashville' as string | null,
            accountIds: ['card-b', 'card-a'],
        };
        const original = travelWindowsSignature({ enabled: true, windows: [base] });
        const sameAccountOrder = travelWindowsSignature({
            enabled: true,
            windows: [{ ...base, accountIds: ['card-a', 'card-b'] }],
        });
        const locationChanged = travelWindowsSignature({
            enabled: true,
            windows: [{ ...base, location: 'Austin' }],
        });
        const accountsChanged = travelWindowsSignature({
            enabled: true,
            windows: [{ ...base, accountIds: ['card-a'] }],
        });
        expect(sameAccountOrder).toBe(original);
        expect(locationChanged).not.toBe(original);
        expect(accountsChanged).not.toBe(original);
    });

    it('composes overlay fingerprints from scoring plus travel signatures', () => {
        expect(overlayFingerprint('score-a', 'off')).toBe('score-a|off');
        expect(overlayFingerprint('score-a', 'off')).not.toBe(overlayFingerprint('score-a', 'abc123'));
    });
});
