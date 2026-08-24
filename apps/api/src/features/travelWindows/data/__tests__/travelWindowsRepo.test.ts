import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import {
    getTravelBiasEnabled,
    insertTravelWindowRow,
    listTravelWindowRows,
    setTravelBiasEnabled,
} from '../travelWindowsRepo';

describe('travelWindowsRepo', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-sqlite-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
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
                accountId: null,
                accountName: null,
            },
            database,
        );

        const windows = await listTravelWindowRows(database);
        expect(windows).toHaveLength(1);
        expect(windows[0]?.name).toBe('Hawaii');
        expect(windows[0]?.startDate).toBe('2026-07-01');
        expect(windows[0]?.accountId).toBeNull();

        await setTravelBiasEnabled(false, database);
        expect(await getTravelBiasEnabled(database)).toBe(false);
    });
});
