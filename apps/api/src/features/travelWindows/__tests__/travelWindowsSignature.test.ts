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
                    accountId: null,
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
                accountId: null,
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

    it('composes overlay fingerprints from scoring plus travel signatures', () => {
        expect(overlayFingerprint('score-a', 'off')).toBe('score-a|off');
        expect(overlayFingerprint('score-a', 'off')).not.toBe(overlayFingerprint('score-a', 'abc123'));
    });
});
