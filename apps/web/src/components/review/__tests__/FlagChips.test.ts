import { describe, expect, it } from 'vitest';

import { travelWindowTooltip } from '../FlagChips';

describe('travelWindowTooltip', () => {
    it('includes the trip name and a readable kind', () => {
        expect(travelWindowTooltip({ name: 'Hawaii', kind: 'vacation' })).toBe('Hawaii · Vacation');
        expect(travelWindowTooltip({ name: 'Austin client week', kind: 'work' })).toBe('Austin client week · Work');
    });
});
