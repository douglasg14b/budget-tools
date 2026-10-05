import { describe, expect, it, vi } from 'vitest';

import type { OpenRouterJsonInput } from '../../../categorization/llm/openRouterClient';
import type { CompleteOpenRouterJson } from '../receiptHeaderVision';
import { parseWrittenAmount, settleHandwrittenTotals } from '../settleHandwrittenTotals';

type BlockRow = { role: string; label: string; writtenText: string; medium: string };
type RowRead = { marksPresent: boolean; writtenText: string | null; amountDollars?: number | null };

type Script = {
    readonly block: readonly BlockRow[];
    readonly tip: RowRead;
    readonly total: RowRead;
    /** Picks an option letter given the total the prompt claims is implied and the listed options. */
    readonly choose?: (claimed: string, options: Record<string, string>) => string;
};

const subtotal = { role: 'subtotal', label: 'Subtotal', writtenText: 'USD 12.66', medium: 'printed' };

function scripted(script: Script): CompleteOpenRouterJson & { calls: OpenRouterJsonInput[] } {
    const calls: OpenRouterJsonInput[] = [];
    const complete = async (input: OpenRouterJsonInput) => {
        calls.push(input);
        return { content: JSON.stringify(answer(script, input)), usage: null };
    };
    return Object.assign(complete, { calls });
}

function answer(script: Script, input: OpenRouterJsonInput): unknown {
    if (input.schemaName === 'receipt_totals_block') {
        return { rows: script.block };
    }
    if (input.schemaName === 'receipt_row_read') {
        return input.system.includes('tip (gratuity)') ? script.tip : script.total;
    }
    if (input.schemaName === 'receipt_total_choice') {
        const claimed = /would be (\$[\d.]+)/.exec(input.system)?.[1] ?? '';
        const options = Object.fromEntries(
            [...input.user.matchAll(/^([ABC])\) (\$[\d.]+)$/gm)].map((match) => [match[1], match[2]]),
        );
        return { observation: 'marks', choice: script.choose?.(claimed, options) ?? 'D' };
    }
    throw new Error(`unexpected schema ${input.schemaName}`);
}

function settle(complete: CompleteOpenRouterJson) {
    return settleHandwrittenTotals({
        apiKey: 'k',
        baseUrl: 'https://example.test',
        model: 'qwen/qwen3.7-plus',
        timeoutMs: 1000,
        processedDataUrl: 'data:image/jpeg;base64,AA',
        completeJson: complete,
    });
}

/** Picks the option whose amount is `amount`. */
function pick(amount: string) {
    return (_claimed: string, options: Record<string, string>) =>
        Object.entries(options).find(([, value]) => value === amount)?.[0] ?? 'D';
}

describe('settleHandwrittenTotals', () => {
    it('accepts a slip whose reads already add up, without asking a disambiguation question', async () => {
        const complete = scripted({
            block: [
                subtotal,
                { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' },
                { role: 'total', label: 'Total', writtenText: '17.66', medium: 'handwritten' },
            ],
            tip: { marksPresent: true, writtenText: '5.00' },
            total: { marksPresent: true, writtenText: '17.66' },
        });
        const { settlement } = await settle(complete);
        expect(settlement).toMatchObject({
            baseMilliunits: 12_660,
            tipMilliunits: 5000,
            totalMilliunits: 17_660,
            totalSource: 'read',
            consistent: true,
            disambiguation: null,
        });
        expect(complete.calls.map((call) => call.schemaName)).not.toContain('receipt_total_choice');
    });

    it('stores no tip when only the blind row read sees one — a stray mark is not a tip', async () => {
        const { settlement } = await settle(
            scripted({
                block: [
                    subtotal,
                    { role: 'tip', label: 'Tip', writtenText: '', medium: 'blank' },
                    { role: 'total', label: 'Total', writtenText: '17.00', medium: 'handwritten' },
                ],
                tip: { marksPresent: true, writtenText: '4.00' },
                total: { marksPresent: true, writtenText: '17.00' },
            }),
        );
        expect(settlement.tipMilliunits).toBe(0);
        // 12.66 implied vs 17.00 read: different dollars, so nothing is resolved.
        expect(settlement).toMatchObject({ totalMilliunits: 17_000, consistent: false, disambiguation: null });
    });

    it('stores no tip when only the block read sees one', async () => {
        const { settlement } = await settle(
            scripted({
                block: [subtotal, { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' }],
                tip: { marksPresent: false, writtenText: null },
                total: { marksPresent: false, writtenText: null },
            }),
        );
        expect(settlement).toMatchObject({ tipMilliunits: 0, totalMilliunits: null, totalSource: null });
    });

    it('resolves raised cents to the implied total when the model picks it and rejects the decoy', async () => {
        const { settlement } = await settle(
            scripted({
                block: [
                    subtotal,
                    { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' },
                    { role: 'total', label: 'Total', writtenText: '17.66', medium: 'handwritten' },
                ],
                tip: { marksPresent: true, writtenText: '5.00' },
                total: { marksPresent: true, writtenText: '17' },
                choose: pick('$17.66'),
            }),
        );
        expect(settlement).toMatchObject({
            tipMilliunits: 5000,
            totalMilliunits: 17_660,
            totalSource: 'reconciled',
            consistent: true,
        });
        expect(settlement.disambiguation).toMatchObject({
            asReadMilliunits: 17_000,
            impliedMilliunits: 17_660,
            decoyMilliunits: 17_160,
            choice: 'implied',
            counterfactualChoice: 'implied',
            accepted: true,
        });
    });

    it('rejects a model that agrees with whatever total it is told is implied', async () => {
        const { settlement } = await settle(
            scripted({
                block: [subtotal, { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' }],
                tip: { marksPresent: true, writtenText: '5.00' },
                total: { marksPresent: true, writtenText: '17' },
                choose: (claimed, options) => pick(claimed)(claimed, options),
            }),
        );
        expect(settlement.disambiguation).toMatchObject({
            choice: 'implied',
            counterfactualChoice: 'decoy',
            accepted: false,
        });
        expect(settlement).toMatchObject({ totalMilliunits: 17_000, totalSource: 'read', consistent: false });
    });

    it('never resolves an addend: a read tip is kept even when another tip would make the sum close', async () => {
        const complete = scripted({
            block: [
                subtotal,
                { role: 'tip', label: 'Tip', writtenText: '4.00', medium: 'handwritten' },
                { role: 'total', label: 'Total', writtenText: '17.00', medium: 'handwritten' },
            ],
            tip: { marksPresent: true, writtenText: '4.00' },
            total: { marksPresent: true, writtenText: '17.00' },
            choose: () => 'A',
        });
        const { settlement } = await settle(complete);
        // 12.66 + 4.00 = 16.66: dollars differ from the 17.00 read, so neither the total nor the
        // tip moves — 4.34 is never offered.
        expect(settlement).toMatchObject({ tipMilliunits: 4000, totalMilliunits: 17_000, consistent: false });
        expect(complete.calls.map((call) => call.schemaName)).not.toContain('receipt_total_choice');
    });

    it('adds the tip to a printed pre-tip total when the slip has one', async () => {
        const { settlement } = await settle(
            scripted({
                block: [
                    { role: 'subtotal', label: 'Subtotal', writtenText: '40.00', medium: 'printed' },
                    { role: 'tax', label: 'Tax', writtenText: '3.20', medium: 'printed' },
                    { role: 'total', label: 'Amount', writtenText: '43.20', medium: 'printed' },
                    { role: 'tip', label: 'Tip', writtenText: '8.00', medium: 'handwritten' },
                    { role: 'total', label: 'Total', writtenText: '51.20', medium: 'handwritten' },
                ],
                tip: { marksPresent: true, writtenText: '8.00' },
                total: { marksPresent: true, writtenText: '51.20' },
            }),
        );
        expect(settlement).toMatchObject({ baseMilliunits: 43_200, totalMilliunits: 51_200, consistent: true });
    });

    it('asks again once when a reply is malformed', async () => {
        let blockCalls = 0;
        const good = scripted({
            block: [subtotal],
            tip: { marksPresent: false, writtenText: null },
            total: { marksPresent: false, writtenText: null },
        });
        const complete = vi.fn(async (input: OpenRouterJsonInput) => {
            if (input.schemaName === 'receipt_totals_block' && blockCalls++ === 0) {
                return { content: '[{"rows":[]},{"rows":[]}]', usage: null };
            }
            return good(input);
        });
        const { settlement, usage } = await settle(complete);
        expect(settlement.baseMilliunits).toBe(12_660);
        expect(blockCalls).toBe(2);
        expect(usage).toHaveLength(4);
    });
});

describe('settleHandwrittenTotals retries', () => {
    it('asks again once when the block read has no subtotal, tip, or total row', async () => {
        let blockCalls = 0;
        const good = scripted({
            block: [subtotal, { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' }],
            tip: { marksPresent: true, writtenText: '5.00' },
            total: { marksPresent: false, writtenText: null },
        });
        const complete = async (input: OpenRouterJsonInput) => {
            if (input.schemaName === 'receipt_totals_block' && blockCalls++ === 0) {
                return {
                    content: JSON.stringify({ rows: [{ role: 'other', label: '', writtenText: '', medium: 'blank' }] }),
                    usage: null,
                };
            }
            return good(input);
        };
        const { settlement } = await settle(complete);
        expect(blockCalls).toBe(2);
        expect(settlement.tipMilliunits).toBe(5000);
    });

    it('prefers the decimal amount the model gives over an ambiguous bare transcription', async () => {
        const { settlement } = await settle(
            scripted({
                block: [subtotal],
                tip: { marksPresent: false, writtenText: null },
                total: { marksPresent: true, writtenText: '1700', amountDollars: 17 },
            }),
        );
        expect(settlement.totalRead.milliunits).toBe(17_000);
    });
});

describe('parseWrittenAmount', () => {
    it('reads printed and handwritten amount spellings', () => {
        expect(parseWrittenAmount('USD 12.66')).toBe(12_660);
        expect(parseWrittenAmount('$5.00')).toBe(5000);
        expect(parseWrittenAmount('17')).toBe(17_000);
        expect(parseWrittenAmount('17 66')).toBe(17_660);
        expect(parseWrittenAmount('1,234.50')).toBe(1_234_500);
        expect(parseWrittenAmount('4.5')).toBe(4500);
    });

    it('returns null for text that is not an amount', () => {
        expect(parseWrittenAmount(null)).toBeNull();
        expect(parseWrittenAmount('')).toBeNull();
        expect(parseWrittenAmount('Approved')).toBeNull();
        expect(parseWrittenAmount('12.66 5.00')).toBeNull();
    });
});
