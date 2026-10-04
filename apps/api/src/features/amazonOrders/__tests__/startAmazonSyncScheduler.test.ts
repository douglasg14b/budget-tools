import { describe, expect, it } from 'vitest';

import { scheduledAmazonSyncRange } from '../startAmazonSyncScheduler';

describe('scheduledAmazonSyncRange', () => {
    it('covers the last week when nothing Amazon is waiting to be classified', () => {
        expect(scheduledAmazonSyncRange('2026-10-03', null)).toEqual({ start: '2026-09-26', end: '2026-10-03' });
    });

    it('reaches back to five days before the oldest uncategorized charge', () => {
        expect(scheduledAmazonSyncRange('2026-10-03', '2026-08-20')).toEqual({
            start: '2026-08-15',
            end: '2026-10-03',
        });
    });

    it('keeps the full week when the oldest uncategorized charge is recent', () => {
        expect(scheduledAmazonSyncRange('2026-10-03', '2026-10-02')).toEqual({
            start: '2026-09-26',
            end: '2026-10-03',
        });
    });
});
