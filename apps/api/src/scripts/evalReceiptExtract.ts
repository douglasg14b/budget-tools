/**
 * Read-only receipt extraction eval. Re-runs `extractReceipt` on every stored receipt (plus the
 * photographed test fixtures and any private local fixtures) and scores the extracted total and tip
 * against ground truth: the bound bank charge for production receipts, the known printed total for
 * fixtures, the expectation file for local fixtures. Never writes to the DB.
 *
 *   pnpm --filter @budget-tools/api eval:receipts run <label> [--only <receipt-id-prefix>]
 *   pnpm --filter @budget-tools/api eval:receipts compare <labelA> <labelB> [...]
 *
 * Models come from the usual env vars (OPENROUTER_MODEL, OPENROUTER_RECEIPT_REPAIR_MODEL), so a
 * shell override evaluates a different model without code changes.
 *
 * Results land in apps/api/.cache/receipt-eval/<label>.json. The payload is recorded generically so
 * the same script scores runs taken before and after a payload-shape change.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createDatabase } from '@budget-tools/db';

import { createAppDatabase } from '../data-persistence/database';
import { getDbConnectionString, OPENROUTER_MODEL, OPENROUTER_RECEIPT_REPAIR_MODEL } from '../environment';
import { readReceiptExtractFrameBytes } from '../features/receipts/data/receiptsRepo';
import { extractReceipt } from '../features/receipts/extractReceipt';

const OUT_DIR = join(process.cwd(), 'apps/api/.cache/receipt-eval');
const FIXTURES_DIR = join(process.cwd(), 'apps/api/src/features/receipts/__tests__/fixtures');
const CONCURRENCY = 4;

/** Mirrors PHOTOGRAPHED_RECEIPTS in extractReceipt.live.test.ts. */
const FIXTURES: readonly { readonly file: string; readonly expectedMilliunits: number }[] = [
    { file: 'walmart.jpg', expectedMilliunits: 191_130 },
    { file: 'save-mart.jpg', expectedMilliunits: 3_990 },
    { file: 'cameron-market.jpg', expectedMilliunits: 87_790 },
    { file: 'tesco.jpg', expectedMilliunits: 6_710 },
    { file: 'biedronka.jpg', expectedMilliunits: 8_270 },
];

/**
 * Private receipts (real card numbers, auth codes) live outside git in this directory as
 * `<name>.jpg` plus `<name>.json`: `{ "totalMilliunits": [17660, null], "tipMilliunits": 5000 }`,
 * where any listed total is acceptable.
 */
const LOCAL_FIXTURES_DIR = join(OUT_DIR, 'fixtures');

type EvalCase = {
    readonly id: string;
    /**
     * `fixture` = known printed total; `bank` = bound bank charge; `local` = private fixture with
     * an expectation file; `unbound` = no ground truth.
     */
    readonly truthSource: 'fixture' | 'bank' | 'local' | 'unbound';
    readonly expectedMilliunits: number | null;
    /** Local fixtures may accept more than one total (e.g. "the total or nothing"). */
    readonly acceptableTotals?: readonly (number | null)[];
    /** Every receipt with ground truth has a known tip; none of the bank-bound ones were tipped. */
    readonly expectedTipMilliunits: number | null;
    readonly storedMilliunits: number | null;
    readonly loadFrames: () => Promise<readonly Buffer[]>;
};

type EvalResult = {
    readonly id: string;
    readonly truthSource: EvalCase['truthSource'];
    readonly expectedMilliunits: number | null;
    readonly storedMilliunits: number | null;
    readonly kind: string;
    readonly status: string | null;
    readonly vendor: string | null;
    readonly totalMilliunits: number | null;
    readonly totalMatchesTruth: boolean | null;
    readonly tipMatchesTruth?: boolean | null;
    readonly payload: Record<string, unknown> | null;
    readonly costUsd: number | null;
    readonly error: string | null;
};

async function loadCases(): Promise<EvalCase[]> {
    const appDb = createAppDatabase(getDbConnectionString());
    const coreDb = createDatabase({ connectionString: getDbConnectionString() });
    const receipts = await appDb
        .selectFrom('receipts')
        .select(['id', 'transactionId', 'printedMilliunits'])
        .orderBy('createdAt', 'asc')
        .execute();
    const boundIds = receipts.map((row) => row.transactionId).filter((id): id is string => Boolean(id));
    const bank =
        boundIds.length === 0
            ? []
            : await coreDb.selectFrom('transactions').select(['id', 'amount']).where('id', 'in', boundIds).execute();
    const bankById = new Map(bank.map((row) => [row.id, Math.abs(row.amount)]));
    await coreDb.destroy();

    const cases: EvalCase[] = receipts.map((row) => {
        const expected = row.transactionId ? (bankById.get(row.transactionId) ?? null) : null;
        return {
            id: row.id,
            truthSource: expected == null ? 'unbound' : 'bank',
            expectedMilliunits: expected,
            expectedTipMilliunits: expected == null ? null : 0,
            storedMilliunits: row.printedMilliunits,
            loadFrames: () => readReceiptExtractFrameBytes(row.id, appDb),
        };
    });
    for (const fixture of FIXTURES) {
        cases.push({
            id: `fixture:${fixture.file}`,
            truthSource: 'fixture',
            expectedMilliunits: fixture.expectedMilliunits,
            expectedTipMilliunits: 0,
            storedMilliunits: null,
            loadFrames: async () => [await readFile(join(FIXTURES_DIR, fixture.file))],
        });
    }
    cases.push(...loadLocalFixtures());
    return cases;
}

function loadLocalFixtures(): EvalCase[] {
    if (!existsSync(LOCAL_FIXTURES_DIR)) {
        return [];
    }
    return readdirSync(LOCAL_FIXTURES_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => {
            const name = file.slice(0, -'.json'.length);
            const expectation = JSON.parse(readFileSync(join(LOCAL_FIXTURES_DIR, file), 'utf8')) as {
                totalMilliunits: (number | null)[];
                tipMilliunits: number;
            };
            return {
                id: `local:${name}`,
                truthSource: 'local' as const,
                expectedMilliunits: expectation.totalMilliunits[0] ?? null,
                acceptableTotals: expectation.totalMilliunits,
                expectedTipMilliunits: expectation.tipMilliunits,
                storedMilliunits: null,
                loadFrames: async () => [await readFile(join(LOCAL_FIXTURES_DIR, `${name}.jpg`))],
            };
        });
}

function totalMatches(evalCase: EvalCase, total: number | null): boolean | null {
    if (evalCase.acceptableTotals) {
        return evalCase.acceptableTotals.includes(total);
    }
    return evalCase.expectedMilliunits == null ? null : total === evalCase.expectedMilliunits;
}

async function evaluate(evalCase: EvalCase): Promise<EvalResult> {
    const base = {
        id: evalCase.id,
        truthSource: evalCase.truthSource,
        expectedMilliunits: evalCase.expectedMilliunits,
        storedMilliunits: evalCase.storedMilliunits,
    };
    try {
        const frames = await evalCase.loadFrames();
        const result = await extractReceipt({ frames, verify: false });
        if (result.kind !== 'complete') {
            return {
                ...base,
                kind: result.kind,
                status: null,
                vendor: null,
                totalMilliunits: null,
                totalMatchesTruth: null,
                payload: null,
                costUsd: null,
                error: null,
            };
        }
        const total = result.printedMilliunits == null ? null : Math.abs(result.printedMilliunits);
        const payload = JSON.parse(result.extractJson) as Record<string, unknown>;
        const tip = typeof payload.tipMilliunits === 'number' ? payload.tipMilliunits : 0;
        return {
            ...base,
            kind: result.kind,
            status: result.extractStatus,
            vendor: result.vendor,
            totalMilliunits: total,
            totalMatchesTruth: totalMatches(evalCase, total),
            tipMatchesTruth: evalCase.expectedTipMilliunits == null ? null : tip === evalCase.expectedTipMilliunits,
            payload,
            costUsd: result.extractCostUsd,
            error: null,
        };
    } catch (error) {
        return {
            ...base,
            kind: 'error',
            status: null,
            vendor: null,
            totalMilliunits: null,
            totalMatchesTruth: evalCase.expectedMilliunits == null ? null : false,
            tipMatchesTruth: evalCase.expectedTipMilliunits == null ? null : false,
            payload: null,
            costUsd: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function mapConcurrent<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index] as T);
            process.stdout.write('.');
        }
    });
    await Promise.all(workers);
    process.stdout.write('\n');
    return results;
}

function summarize(label: string, results: readonly EvalResult[]): Record<string, unknown> {
    const withTruth = results.filter((row) => row.truthSource !== 'unbound');
    const gated = results.filter((row) => row.status === 'gated');
    return {
        label,
        headerModel: OPENROUTER_MODEL,
        linesModel: OPENROUTER_RECEIPT_REPAIR_MODEL,
        receipts: results.length,
        withTruth: withTruth.length,
        totalCorrect: withTruth.filter((row) => row.totalMatchesTruth).length,
        tipCorrect: withTruth.filter((row) => row.tipMatchesTruth).length,
        // The failure that must stay at zero: a stored tip that is not on the receipt. A missed
        // real tip (stored 0) is a safe failure and is counted only in tipCorrect.
        wrongNonZeroTips: withTruth.filter((row) => row.tipMatchesTruth === false && tipOf(row) !== 0).length,
        gated: gated.length,
        gatedWithWrongTotal: gated.filter((row) => row.totalMatchesTruth === false).length,
        ungated: results.filter((row) => row.status === 'ungated').length,
        failed: results.filter((row) => row.status === 'failed' || row.kind === 'error').length,
        costUsd: Number(results.reduce((sum, row) => sum + (row.costUsd ?? 0), 0).toFixed(4)),
    };
}

function tipOf(row: EvalResult): number {
    const tip = row.payload?.tipMilliunits;
    return typeof tip === 'number' ? tip : 0;
}

async function run(label: string, onlyPrefix: string | undefined): Promise<void> {
    const cases = (await loadCases()).filter((evalCase) => !onlyPrefix || evalCase.id.startsWith(onlyPrefix));
    console.log(`evaluating ${cases.length} receipts as "${label}"`);
    const results = await mapConcurrent(cases, CONCURRENCY, evaluate);
    mkdirSync(OUT_DIR, { recursive: true });
    const summary = summarize(label, results);
    writeFileSync(join(OUT_DIR, `${label}.json`), JSON.stringify({ summary, results }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
}

function compare(labels: readonly string[]): void {
    const runs = labels.map(
        (label) =>
            JSON.parse(readFileSync(join(OUT_DIR, `${label}.json`), 'utf8')) as {
                summary: Record<string, unknown>;
                results: EvalResult[];
            },
    );
    console.table(runs.map((runData) => runData.summary));
    const ids = runs[0]?.results.map((row) => row.id) ?? [];
    const dollars = (value: number | null | undefined) => (value == null ? '—' : (value / 1000).toFixed(2));
    const rows = ids.map((id) => {
        const first = runs[0]?.results.find((row) => row.id === id);
        const row: Record<string, string> = {
            id: id.includes(':') ? id : id.slice(0, 8),
            truth: first?.truthSource === 'unbound' ? 'unbound' : dollars(first?.expectedMilliunits),
        };
        labels.forEach((label, index) => {
            const result = runs[index]?.results.find((candidate) => candidate.id === id);
            const tip = result?.payload?.tipMilliunits;
            const mark = result?.totalMatchesTruth === true ? '✓' : result?.totalMatchesTruth === false ? '✗' : ' ';
            const tipMark = result?.tipMatchesTruth === false ? ' ✗TIP' : '';
            row[label] =
                `${mark} ${dollars(result?.totalMilliunits)} ${result?.status ?? result?.kind ?? ''}` +
                (typeof tip === 'number' && tip !== 0 ? ` tip ${dollars(tip)}` : '') +
                tipMark;
        });
        return row;
    });
    const changed = rows.filter((row) => new Set(labels.map((label) => row[label])).size > 1);
    console.log(`\n${changed.length} of ${rows.length} receipts differ across runs:`);
    console.table(changed);
    console.log('\nUnbound receipts (no ground truth — inspect by eye):');
    console.table(rows.filter((row) => row.truth === 'unbound'));
    console.log('\nLocal fixtures:');
    console.table(rows.filter((row) => row.id?.startsWith('local:')));
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'run' && rest[0]) {
    const onlyIndex = rest.indexOf('--only');
    await run(rest[0], onlyIndex === -1 ? undefined : rest[onlyIndex + 1]);
} else if (mode === 'compare' && rest.length >= 1) {
    compare(rest);
} else {
    console.error('usage: evalReceiptExtract run <label> [--only <id-prefix>] | compare <labelA> <labelB> [...]');
    process.exit(1);
}
