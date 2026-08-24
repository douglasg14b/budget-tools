import type { PayeeResolutionMethod } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { PAYEE_RENAME_EXPLANATIONS } from '../payeeRenameCopy';

const METHODS = [
    'ExactLookup',
    'ClusterLookup',
    'Model',
    'Llm',
    'Unresolved',
] as const satisfies readonly PayeeResolutionMethod[];

describe('PAYEE_RENAME_EXPLANATIONS', () => {
    it('explains every resolution method', () => {
        expect(Object.keys(PAYEE_RENAME_EXPLANATIONS).sort()).toEqual([...METHODS].sort());
        for (const method of METHODS) {
            expect(PAYEE_RENAME_EXPLANATIONS[method].length).toBeGreaterThan(20);
        }
    });

    it('distinguishes history lookups from model and LLM guesses', () => {
        expect(PAYEE_RENAME_EXPLANATIONS.ExactLookup).toMatch(/previous transactions/i);
        expect(PAYEE_RENAME_EXPLANATIONS.ClusterLookup).toMatch(/history/i);
        expect(PAYEE_RENAME_EXPLANATIONS.Model).toMatch(/model/i);
        expect(PAYEE_RENAME_EXPLANATIONS.Llm).toMatch(/language model/i);
    });
});
