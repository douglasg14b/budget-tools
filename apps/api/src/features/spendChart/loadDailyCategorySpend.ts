import { sql } from 'kysely';

import { getDatabase } from '../../data/database';

export type DailyCategorySpendRow = {
    /** `YYYY-MM-DD`, formatted in SQL so the JS Date timezone never shifts the day. */
    day: string;
    categoryId: string;
    categoryName: string;
    groupName: string;
    /** Net spend in milliunits: outflows positive, refunds negative. */
    spentMilliunits: number;
};

type QueryRow = {
    day: string;
    category_id: string;
    category_name: string;
    group_name: string;
    spent: number;
};

/**
 * Net spend per category per day between `startDate` and `endDate` inclusive (ISO dates).
 *
 * Split transactions count through their subtransactions, each under its own category.
 * Transfers, income (Ready to Assign and the rest of Internal Master Category), credit card
 * payment categories, and Uncategorized are left out. Days with no spend in a category are
 * not returned.
 */
export async function loadDailyCategorySpend(startDate: string, endDate: string): Promise<DailyCategorySpendRow[]> {
    const result = await sql<QueryRow>`
        with lines as (
            select t.date, t.category_id, t.amount
            from transactions t
            where t.deleted = false
                and t.transfer_account_id is null
                and t.category_id is not null
                and case
                    when jsonb_typeof(t.subtransactions) = 'array' then jsonb_array_length(t.subtransactions) = 0
                    else true
                end
            union all
            select t.date, s.line ->> 'category_id', (s.line ->> 'amount')::integer
            from transactions t
            cross join lateral jsonb_array_elements(
                case when jsonb_typeof(t.subtransactions) = 'array' then t.subtransactions else '[]'::jsonb end
            ) as s(line)
            where t.deleted = false
                and coalesce((s.line ->> 'deleted')::boolean, false) = false
                and s.line ->> 'transfer_account_id' is null
                and s.line ->> 'category_id' is not null
        )
        select
            to_char(l.date, 'YYYY-MM-DD') as day,
            c.id as category_id,
            c.name as category_name,
            g.name as group_name,
            (-sum(l.amount))::integer as spent
        from lines l
        inner join categories c on c.id = l.category_id
        inner join category_groups g on g.id = c.category_group_id
        where l.date >= ${startDate}::date
            and l.date <= ${endDate}::date
            and lower(g.name) not in ('internal master category', 'credit card payments')
            and lower(c.name) <> 'uncategorized'
        group by l.date, c.id, c.name, g.name
        having sum(l.amount) <> 0
        order by l.date, c.name
    `.execute(getDatabase());

    return result.rows.map((row) => ({
        day: row.day,
        categoryId: row.category_id,
        categoryName: row.category_name,
        groupName: row.group_name,
        spentMilliunits: row.spent,
    }));
}
