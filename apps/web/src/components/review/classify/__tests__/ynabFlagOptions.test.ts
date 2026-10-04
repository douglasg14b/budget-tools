import { describe, expect, it } from 'vitest';

import { ynabFlagLabel, ynabFlagOptions } from '../ynabFlagOptions';

describe('ynabFlagOptions', () => {
    it('lists every color in YNAB order, named from the flags endpoint', () => {
        const options = ynabFlagOptions(
            [
                { color: 'purple', name: 'Reimburse' },
                { color: 'red', name: '  ' },
            ],
            { flagColor: null, flagName: null },
        );
        expect(options).toEqual([
            { color: 'red', label: 'Red' },
            { color: 'orange', label: 'Orange' },
            { color: 'yellow', label: 'Yellow' },
            { color: 'green', label: 'Green' },
            { color: 'blue', label: 'Blue' },
            { color: 'purple', label: 'Reimburse' },
        ]);
        expect(ynabFlagLabel(options, 'purple')).toBe('Reimburse');
    });

    it("uses the transaction's own flag name while the flags are not loaded", () => {
        const options = ynabFlagOptions(undefined, { flagColor: 'blue', flagName: 'Follow up' });
        expect(options.find((option) => option.color === 'blue')?.label).toBe('Follow up');
        expect(options.find((option) => option.color === 'red')?.label).toBe('Red');
    });
});
