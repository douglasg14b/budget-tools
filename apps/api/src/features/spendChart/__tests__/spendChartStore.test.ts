import type { NewTransaction, SubTransactionSchema } from '@budget-tools/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDatabase } from '../../../data/database';
import type { TestAppDatabase } from '../../../data-persistence/testDatabase';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { QueryValidationError } from '../../categorization/filterQueue';
import { NotFoundError } from '../../travelWindows/HttpError';
import { loadSmoothingWindows } from '../data/categorySmoothingRepo';
import { buildSpendChart, setCategorySmoothing } from '../spendChartStore';

describe('spendChartStore', () => {
    let appDb: TestAppDatabase;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        await getDatabase()
            .insertInto('category_groups')
            .values([
                { id: 'g-food', name: 'Food', hidden: false, deleted: false },
                { id: 'g-internal', name: 'Internal Master Category', hidden: false, deleted: false },
                { id: 'g-cc', name: 'Credit Card Payments', hidden: false, deleted: false },
            ])
            .execute();
        await getDatabase()
            .insertInto('categories')
            .values([
                category('c-groceries', 'g-food', 'Groceries'),
                category('c-dining', 'g-food', 'Dining Out'),
                category('c-rta', 'g-internal', 'Inflow: Ready to Assign'),
                category('c-uncat', 'g-internal', 'Uncategorized'),
                category('c-visa', 'g-cc', 'Visa'),
            ])
            .execute();
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('charts spend per day, expanding splits and skipping transfers, income and card payments', async () => {
        await getDatabase()
            .insertInto('transactions')
            .values([
                transaction('groceries', '2026-03-02', -40_000, 'c-groceries'),
                transaction('refund', '2026-03-03', 5_000, 'c-groceries'),
                transaction('split', '2026-03-03', -30_000, null, [
                    sub('s1', -20_000, 'c-groceries'),
                    sub('s2', -10_000, 'c-dining'),
                    sub('s3', -99_000, 'c-dining', { deleted: true }),
                    sub('s4', -7_000, null, { transfer_account_id: 'acct-2' }),
                ]),
                transaction('paycheck', '2026-03-02', 900_000, 'c-rta'),
                transaction('card-payment', '2026-03-02', -50_000, 'c-visa'),
                transaction('transfer', '2026-03-02', -60_000, 'c-groceries', [], 'acct-2'),
                transaction('deleted', '2026-03-02', -70_000, 'c-groceries', [], null, true),
                transaction('outside', '2026-03-05', -1_000, 'c-dining'),
            ])
            .execute();

        const chart = await buildSpendChart('2026-03-01', '2026-03-04', appDb.db);

        expect(chart.days).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']);
        expect(chart.categories).toEqual([
            {
                categoryId: 'c-groceries',
                categoryName: 'Groceries',
                groupName: 'Food',
                windowDays: 1,
                totalMilliunits: 55_000,
                dailyMilliunits: [0, 40_000, 15_000, 0],
            },
            {
                categoryId: 'c-dining',
                categoryName: 'Dining Out',
                groupName: 'Food',
                windowDays: 1,
                totalMilliunits: 10_000,
                dailyMilliunits: [0, 0, 10_000, 0],
            },
        ]);
    });

    it('spreads a smoothed category forward, including purchases made before the range', async () => {
        await setCategorySmoothing('c-groceries', 4, appDb.db);
        await getDatabase()
            .insertInto('transactions')
            .values([
                transaction('before-range', '2026-02-27', -40_000, 'c-groceries'),
                transaction('in-range', '2026-03-03', -20_000, 'c-groceries'),
            ])
            .execute();

        const chart = await buildSpendChart('2026-03-01', '2026-03-06', appDb.db);

        expect(chart.categories).toEqual([
            {
                categoryId: 'c-groceries',
                categoryName: 'Groceries',
                groupName: 'Food',
                windowDays: 4,
                totalMilliunits: 20_000,
                // 40 spread over Feb 27 – Mar 2, then 20 spread over Mar 3 – Mar 6.
                dailyMilliunits: [10_000, 10_000, 5_000, 5_000, 5_000, 5_000],
            },
        ]);
    });

    it('stores, updates and clears a smoothing window', async () => {
        await setCategorySmoothing('c-groceries', 7, appDb.db);
        await setCategorySmoothing('c-groceries', 10, appDb.db);
        expect(await loadSmoothingWindows(appDb.db)).toEqual(new Map([['c-groceries', 10]]));

        await setCategorySmoothing('c-groceries', 1, appDb.db);
        expect(await loadSmoothingWindows(appDb.db)).toEqual(new Map());
    });

    it('rejects bad windows, unknown categories and bad ranges', async () => {
        const reject = QueryValidationError;
        await expect(setCategorySmoothing('c-groceries', 0, appDb.db)).rejects.toBeInstanceOf(reject);
        await expect(setCategorySmoothing('c-groceries', 3.5, appDb.db)).rejects.toBeInstanceOf(reject);
        await expect(setCategorySmoothing('missing', 7, appDb.db)).rejects.toBeInstanceOf(NotFoundError);
        await expect(buildSpendChart('2026-03-05', '2026-03-01', appDb.db)).rejects.toBeInstanceOf(reject);
        await expect(buildSpendChart('2026-02-30', '2026-03-01', appDb.db)).rejects.toBeInstanceOf(reject);
        await expect(buildSpendChart('2020-01-01', '2026-03-01', appDb.db)).rejects.toBeInstanceOf(reject);
    });
});

function category(id: string, groupId: string, name: string) {
    return { id, category_group_id: groupId, name, hidden: false, deleted: false, note: null };
}

function sub(id: string, amount: number, categoryId: string | null, overrides: Partial<SubTransactionSchema> = {}) {
    return {
        id,
        transaction_id: 'split',
        amount,
        memo: null,
        payee_id: null,
        payee_name: null,
        category_id: categoryId,
        category_name: null,
        transfer_account_id: null,
        transfer_transaction_id: null,
        deleted: false,
        ...overrides,
    } satisfies SubTransactionSchema;
}

function transaction(
    id: string,
    date: string,
    amount: number,
    categoryId: string | null,
    subtransactions: SubTransactionSchema[] = [],
    transferAccountId: string | null = null,
    deleted = false,
): NewTransaction {
    return {
        id,
        date,
        amount,
        memo: null,
        cleared: 'cleared',
        approved: true,
        flag_color: null,
        flag_name: null,
        account_id: 'acct-1',
        payee_id: null,
        category_id: categoryId,
        transfer_account_id: transferAccountId,
        transfer_transaction_id: null,
        matched_transaction_id: null,
        import_id: null,
        import_payee_name: null,
        import_payee_name_original: null,
        debt_transaction_type: null,
        deleted,
        account_name: 'Checking',
        payee_name: null,
        category_name: null,
        subtransactions: JSON.stringify(subtransactions),
        meta: {
            first_seen_date: date,
            first_cleared_date: null,
            first_approved_date: null,
            first_categorized_date: null,
        },
    };
}
