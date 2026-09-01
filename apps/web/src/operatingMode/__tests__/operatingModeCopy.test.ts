import { describe, expect, it } from 'vitest';
import type { OperatingMode } from '../operatingModeCopy';
import { operatingModeClassifyNote, operatingModeReceiptsNote } from '../operatingModeCopy';

describe('operatingModeCopy', () => {
    it('states the YNAB write contract for each mode', () => {
        const practice: OperatingMode = 'practice';
        const live: OperatingMode = 'live';
        expect(operatingModeClassifyNote(practice)).toContain('nothing is written');
        expect(operatingModeClassifyNote(live)).toContain('write to YNAB');
        expect(operatingModeReceiptsNote(practice)).toContain('this tab only');
        expect(operatingModeReceiptsNote(live)).toContain('originals and binds');
    });
});
