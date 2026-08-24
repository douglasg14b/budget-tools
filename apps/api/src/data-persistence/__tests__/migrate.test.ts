import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../migrate';

describe('sqlite migrations', () => {
    it('registers every migration file', async () => {
        const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
        const files = (await readdir(migrationsDir)).filter(
            (file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts'),
        );
        const fileKeys = files.map((file) => file.substring(0, file.lastIndexOf('.'))).sort();
        expect(Object.keys(MIGRATIONS).sort()).toEqual(fileKeys);
    });
});
