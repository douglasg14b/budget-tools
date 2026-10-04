import { getDatabase } from '../../data/database';
import { YNAB_FLAG_COLORS } from '../ynabSync/ynabFlagColor';
import type { YnabFlagsDto } from './categorizationDtos';

/**
 * Every YNAB flag color with its user-defined name. YNAB exposes flag names only on
 * transactions, so each name is the most recent one on a non-deleted mirrored transaction.
 */
export async function listYnabFlags(): Promise<YnabFlagsDto> {
    const rows = await getDatabase()
        .selectFrom('transactions')
        .distinctOn('flag_color')
        .select(['flag_color', 'flag_name'])
        .where('deleted', '=', false)
        .where('flag_color', 'is not', null)
        .where('flag_name', 'is not', null)
        .where('flag_name', '<>', '')
        .orderBy('flag_color')
        .orderBy('date', 'desc')
        .orderBy('id', 'desc')
        .execute();
    const namesByColor = new Map(rows.map((row) => [row.flag_color, row.flag_name]));
    return {
        flags: YNAB_FLAG_COLORS.map((color) => ({ color, name: namesByColor.get(color) ?? null })),
    };
}
