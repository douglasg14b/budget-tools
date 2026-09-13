import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createTestAppDatabase } from '../../../../data-persistence/testDatabase';
import { getOperatingMode, requireLiveMode, setOperatingMode } from '../operatingModeRepo';

describe('operatingModeRepo', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('seeds practice and round-trips live', async () => {
        expect(await getOperatingMode(database)).toBe('practice');
        await setOperatingMode('live', database);
        expect(await getOperatingMode(database)).toBe('live');
        await setOperatingMode('practice', database);
        expect(await getOperatingMode(database)).toBe('practice');
    });

    it('requireLiveMode refuses practice and allows live', async () => {
        await expect(requireLiveMode(database)).rejects.toMatchObject({ statusCode: 403 });
        await setOperatingMode('live', database);
        await expect(requireLiveMode(database)).resolves.toBeUndefined();
    });
});
