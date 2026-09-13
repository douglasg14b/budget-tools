import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createTestAppDatabase } from '../../../../data-persistence/testDatabase';
import {
    getTravelBiasEnabled,
    insertTravelWindowRow,
    listTravelWindowRows,
    setTravelBiasEnabled,
    updateTravelWindowRow,
} from '../travelWindowsRepo';

describe('travelWindowsRepo', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('seeds travel bias enabled and stores windows', async () => {
        expect(await getTravelBiasEnabled(database)).toBe(true);

        await insertTravelWindowRow(
            '11111111-1111-1111-1111-111111111111',
            {
                name: 'Hawaii',
                kind: 'vacation',
                startDate: '2026-07-01',
                endDate: '2026-07-10',
                location: null,
                accounts: [],
            },
            database,
        );

        const windows = await listTravelWindowRows(database);
        expect(windows).toHaveLength(1);
        expect(windows[0]?.name).toBe('Hawaii');
        expect(windows[0]?.startDate).toBe('2026-07-01');
        expect(windows[0]?.location).toBeNull();
        expect(windows[0]?.accounts).toEqual([]);

        await setTravelBiasEnabled(false, database);
        expect(await getTravelBiasEnabled(database)).toBe(false);
    });

    it('round-trips location and multiple accounts', async () => {
        const id = '22222222-2222-2222-2222-222222222222';
        await insertTravelWindowRow(
            id,
            {
                name: 'Nashville',
                kind: 'vacation',
                startDate: '2026-08-01',
                endDate: '2026-08-05',
                location: 'Nashville, TN',
                accounts: [
                    { id: 'card-a', name: 'Visa' },
                    { id: 'card-b', name: 'Amex' },
                ],
            },
            database,
        );

        const created = await listTravelWindowRows(database);
        expect(created[0]?.location).toBe('Nashville, TN');
        expect(created[0]?.accounts).toEqual([
            { id: 'card-b', name: 'Amex' },
            { id: 'card-a', name: 'Visa' },
        ]);

        await updateTravelWindowRow(
            id,
            {
                name: 'Nashville',
                kind: 'vacation',
                startDate: '2026-08-01',
                endDate: '2026-08-05',
                location: 'Franklin, TN',
                accounts: [{ id: 'card-b', name: 'Amex' }],
            },
            database,
        );

        const updated = await listTravelWindowRows(database);
        expect(updated[0]?.location).toBe('Franklin, TN');
        expect(updated[0]?.accounts).toEqual([{ id: 'card-b', name: 'Amex' }]);
    });
});
