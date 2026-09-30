import { describe, expect, it } from 'vitest';

import type { DecisionsInput, DecisionsResult } from '../decisionsClient';
import { parseDecisionsUsage } from '../decisionsClient';
import { buildVerifyState, RECEIPT_VERIFY_THRESHOLD, verifyReceiptExtract } from '../verifyReceiptExtract';

const BASE = {
    apiKey: 'key',
    model: 'typesafe/jev-1.13',
    vendor: 'SAFEWAY',
    printedMilliunits: 26560,
    lines: [
        { name: 'SUNCHIPS SALSA', amountMilliunits: 4490, quantity: 1 },
        { name: 'Discount', amountMilliunits: -3500, quantity: 1 },
    ],
    taxMilliunits: 0,
    discountMilliunits: 3500,
};

function stub(nouls: Record<string, number>, capture?: (input: DecisionsInput) => void) {
    return async (input: DecisionsInput): Promise<DecisionsResult> => {
        capture?.(input);
        return { nouls, usage: null };
    };
}

describe('verifyReceiptExtract', () => {
    it('flags both defects when each score clears the threshold', async () => {
        const result = await verifyReceiptExtract({
            ...BASE,
            completeDecisionsImpl: stub({ vendor_looks_truncated: 0.81, discount_double_counted: 0.95 }),
        });
        expect(result.flags).toEqual(['vendor-suspect', 'discount-double-counted']);
    });

    it('does not flag scores below the threshold', async () => {
        const result = await verifyReceiptExtract({
            ...BASE,
            completeDecisionsImpl: stub({ vendor_looks_truncated: 0.4, discount_double_counted: 0.12 }),
        });
        expect(result.flags).toEqual([]);
    });

    it('treats the threshold as inclusive', async () => {
        const result = await verifyReceiptExtract({
            ...BASE,
            completeDecisionsImpl: stub({ vendor_looks_truncated: RECEIPT_VERIFY_THRESHOLD }),
        });
        expect(result.flags).toEqual(['vendor-suspect']);
    });

    it('omits a flag when the model did not answer that question', async () => {
        const result = await verifyReceiptExtract({
            ...BASE,
            completeDecisionsImpl: stub({ discount_double_counted: 0.9 }),
        });
        expect(result.flags).toEqual(['discount-double-counted']);
    });

    it('never flags a suspect vendor when there is no vendor to judge', async () => {
        const result = await verifyReceiptExtract({
            ...BASE,
            vendor: null,
            completeDecisionsImpl: stub({ vendor_looks_truncated: 0.99 }),
        });
        expect(result.flags).toEqual([]);
    });

    it('withholds the arithmetic verdict from the state', async () => {
        const seen: DecisionsInput[] = [];
        await verifyReceiptExtract({
            ...BASE,
            completeDecisionsImpl: stub({}, (input) => {
                seen.push(input);
            }),
        });
        const state = seen[0]?.state ?? '';
        expect(state).toContain('SAFEWAY');
        expect(state).toContain('SUNCHIPS SALSA');
        // Handing the model the gate result inflated agreement 12/20 -> 20/20.
        expect(state.toLowerCase()).not.toContain('agree');
        expect(state.toLowerCase()).not.toContain('arithmetic');
    });
});

describe('buildVerifyState', () => {
    it('renders milliunits as dollars', () => {
        const state = buildVerifyState({ ...BASE, completeDecisionsImpl: undefined });
        expect(state).toContain('$26.56');
        expect(state).toContain('$4.49');
        expect(state).toContain('Discount recorded separately: $3.50');
    });

    it('marks an empty line list rather than rendering nothing', () => {
        const state = buildVerifyState({ ...BASE, lines: [], completeDecisionsImpl: undefined });
        expect(state).toContain('(none)');
    });
});

describe('parseDecisionsUsage', () => {
    it('maps snake_case decisions usage onto the shared usage shape', () => {
        const usage = parseDecisionsUsage({ usage: { input_tokens: 275, output_tokens: 20, cost: 0.00003 } });
        expect(usage).toEqual({
            promptTokens: 275,
            completionTokens: 20,
            totalTokens: 295,
            cachedTokens: null,
            costUsd: 0.00003,
        });
    });

    it('returns null when nothing usable is present', () => {
        expect(parseDecisionsUsage({ usage: {} })).toBeNull();
        expect(parseDecisionsUsage({})).toBeNull();
        expect(parseDecisionsUsage(null)).toBeNull();
    });
});
