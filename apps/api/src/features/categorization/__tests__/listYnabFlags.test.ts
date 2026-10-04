import type { NewTransaction } from '@budget-tools/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDatabase } from '../../../data/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import type { YnabFlagColor } from '../../ynabSync/ynabFlagColor';
import { listYnabFlags } from '../listYnabFlags';

describe('listYnabFlags', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('lists every color with null names when no transaction is flagged', async () => {
        expect(await listYnabFlags()).toEqual({
            flags: [
                { color: 'red', name: null },
                { color: 'orange', name: null },
                { color: 'yellow', name: null },
                { color: 'green', name: null },
                { color: 'blue', name: null },
                { color: 'purple', name: null },
            ],
        });
    });

    it('names each color from its most recent non-deleted, named transaction', async () => {
        await getDatabase()
            .insertInto('transactions')
            .values([
                transaction('red-old', '2026-01-01', 'red', 'Old name'),
                transaction('red-new', '2026-03-01', 'red', 'Ask Sam'),
                transaction('red-unnamed', '2026-04-01', 'red', null),
                transaction('red-deleted', '2026-05-01', 'red', 'Deleted name', true),
                transaction('blue', '2026-02-01', 'blue', 'Reimbursable'),
                transaction('unflagged', '2026-06-01', null, null),
            ])
            .execute();

        const { flags } = await listYnabFlags();
        expect(flags.find((flag) => flag.color === 'red')).toEqual({ color: 'red', name: 'Ask Sam' });
        expect(flags.find((flag) => flag.color === 'blue')).toEqual({ color: 'blue', name: 'Reimbursable' });
        expect(flags.find((flag) => flag.color === 'green')).toEqual({ color: 'green', name: null });
        expect(flags).toHaveLength(6);
    });
});

function transaction(
    id: string,
    date: string,
    flagColor: YnabFlagColor | null,
    flagName: string | null,
    deleted = false,
): NewTransaction {
    return {
        id,
        date,
        amount: -1000,
        memo: null,
        cleared: 'cleared',
        approved: false,
        flag_color: flagColor,
        flag_name: flagName,
        account_id: 'acct-1',
        payee_id: null,
        category_id: null,
        transfer_account_id: null,
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
        subtransactions: JSON.stringify([]),
        meta: {
            first_seen_date: date,
            first_cleared_date: null,
            first_approved_date: null,
            first_categorized_date: null,
        },
    };
}
