import { describe, expect, it } from 'vitest';

import type { ReceiptBindStatus } from '../receiptBindStatusCopy';
import { describeBoundSource, describeLastBindCheck } from '../receiptBindStatusCopy';

function status(overrides: Partial<ReceiptBindStatus>): ReceiptBindStatus {
    return { bindSource: null, bindJevScore: null, bindCheckedAt: null, bindCheckOutcome: null, ...overrides };
}

describe('describeBoundSource', () => {
    it('names who bound the receipt and how sure Jev was', () => {
        expect(describeBoundSource(status({ bindSource: 'auto', bindJevScore: 0.964 }))).toBe(
            'Auto-bound · Jev 96% sure',
        );
        expect(describeBoundSource(status({ bindSource: 'manual' }))).toBe('Bound by you');
        expect(describeBoundSource(status({ bindSource: 'capture' }))).toBe('Bound at capture');
        expect(describeBoundSource(status({}))).toBeNull();
    });
});

describe('describeLastBindCheck', () => {
    const now = new Date('2026-10-03T12:10:00Z');

    it('says when the binder last looked and why it waited', () => {
        expect(
            describeLastBindCheck(
                status({ bindCheckedAt: '2026-10-03T12:06:00Z', bindCheckOutcome: 'no-candidate' }),
                now,
            ),
        ).toBe('Auto-bind checked 4 min ago: no charge with this exact total yet.');
    });

    it('stays quiet before the first check and after a bind', () => {
        expect(describeLastBindCheck(status({}), now)).toBeNull();
        expect(
            describeLastBindCheck(status({ bindCheckedAt: '2026-10-03T12:06:00Z', bindCheckOutcome: 'bound' }), now),
        ).toBeNull();
    });
});
