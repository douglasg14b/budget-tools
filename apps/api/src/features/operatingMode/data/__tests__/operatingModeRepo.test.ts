import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import { getOperatingMode, requireLiveMode, setOperatingMode } from '../operatingModeRepo';

describe('operatingModeRepo', () => {
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
