import { describe, expect, it } from 'vitest';

import { addIsoDays, amazonSyncWindow } from '../amazonSyncWindow';

describe('amazonSyncWindow', () => {
    it('covers five days before the bank date and one day after', () => {
        expect(amazonSyncWindow('2026-02-10')).toEqual({ from: '2026-02-05', to: '2026-02-11' });
        expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
    });
});
