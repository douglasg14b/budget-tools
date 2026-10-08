import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '@budget-tools/db';
import { stripRemoteEnv } from '@budget-tools/shared-node';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { createAppDatabase, getAppDatabase } from '../data-persistence/database';
import { getDbConnectionString } from '../environment';

// These guard production (.env.local) from the test suite. If one fails, fix the guard;
// never loosen the test.
describe('test safety guards', () => {
    it('strips remote-pointing variables however they were set', () => {
        process.env.DB_CONNECTION_STRING = 'postgresql://u:p@db.example.com/x';
        process.env.RECEIPTS_S3_BUCKET = 'prod-bucket';
        process.env.RECEIPTS_DIR = 'apps/api/data/receipts';

        expect(stripRemoteEnv()).toEqual(expect.arrayContaining(['DB_CONNECTION_STRING', 'RECEIPTS_S3_BUCKET']));
        expect(process.env.DB_CONNECTION_STRING).toBeUndefined();
        expect(process.env.RECEIPTS_S3_BUCKET).toBeUndefined();
        expect(process.env.RECEIPTS_DIR).toBe('apps/api/data/receipts');
    });

    it('ran the strip before this file loaded', () => {
        expect(process.env.DB_CONNECTION_STRING).toBeUndefined();
        expect(process.env.YNAB_API_KEY).toBeUndefined();
        expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
        expect(Object.keys(process.env).filter((name) => name.includes('_S3_'))).toEqual([]);
    });

    it('refuses to open a real Postgres connection through any factory', async () => {
        expect(() => getDbConnectionString()).toThrow(/inside a test run/);
        expect(() => createDatabase({ connectionString: 'postgresql://u:p@db.example.com/x' })).toThrow(
            /inside a test run/,
        );
        expect(() => createAppDatabase('postgresql://u:p@db.example.com/x')).toThrow(/inside a test run/);
        await expect(getAppDatabase()).rejects.toThrow(/inside a test run/);
    });

    it('blocks a raw pg client aimed at a remote host', async () => {
        const client = new pg.Client({ connectionString: 'postgresql://u:p@db.example.com:5432/x' });
        await expect(client.connect()).rejects.toThrow(/Blocked a network connection/);
    });

    it('blocks fetch and raw sockets to remote hosts', async () => {
        await expect(fetch('https://example.com/')).rejects.toSatisfy((error: unknown) =>
            /Blocked a network connection/.test(String((error as Error & { cause?: unknown }).cause ?? error)),
        );
        expect(() => net.connect({ host: '10.0.0.1', port: 5432 })).toThrow(/Blocked a network connection/);
        expect(() => net.connect(443, 's3.home.lan')).toThrow(/Blocked a network connection/);
    });

    it('keeps .env.local and dotenvx out of every default test script', () => {
        const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
        const manifests = ['package.json', ...['apps', 'packages'].flatMap((dir) => workspaceManifests(repoRoot, dir))];
        const offenders = manifests.flatMap((manifest) => {
            const { scripts = {} } = JSON.parse(readFileSync(join(repoRoot, manifest), 'utf8')) as {
                scripts?: Record<string, string>;
            };
            return Object.entries(scripts)
                .filter(([name]) => /^(pre|post)?test(:|$)/.test(name) && name !== 'test:live')
                .filter(([, command]) => /\.env\.local|dotenvx/.test(command))
                .map(([name]) => `${manifest} → ${name}`);
        });
        expect(offenders).toEqual([]);
    });

    it('still allows loopback connections to servers a test starts', async () => {
        const server = net.createServer((socket) => socket.end('ok'));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as net.AddressInfo;
        try {
            const reply = await new Promise<string>((resolve, reject) => {
                const socket = net.connect(port, '127.0.0.1');
                socket.setEncoding('utf8');
                socket.on('data', resolve);
                socket.on('error', reject);
            });
            expect(reply).toBe('ok');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});

function workspaceManifests(repoRoot: string, dir: string): string[] {
    return readdirSync(join(repoRoot, dir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${dir}/${entry.name}/package.json`)
        .filter((manifest) => existsSync(join(repoRoot, manifest)));
}
