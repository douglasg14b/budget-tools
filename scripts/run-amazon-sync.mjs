import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureVenv, runChecked } from './lib/pythonVenv.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workingDir = join(repoRoot, 'apps', 'amazon-sync');
const syncUrlSetting = process.env.AMAZON_SYNC_URL?.trim();

const serviceVenv = () =>
    ensureVenv({
        venvDir: join(workingDir, '.venv'),
        requirements: join(workingDir, 'requirements.txt'),
        cwd: workingDir,
    });

if (process.argv[2] === 'test') {
    runChecked(serviceVenv(), ['-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], { cwd: workingDir });
    process.exit(0);
}

// `pnpm dev` starts this for everyone; without AMAZON_SYNC_URL the API uses the MCP (or
// nothing), so there is no service to run. Exit cleanly rather than fail the dev stack.
if (!syncUrlSetting) {
    console.log('AMAZON_SYNC_URL is not set; not starting amazon-sync.');
    process.exit(0);
}
const syncUrl = new URL(syncUrlSetting);

// The service reads the jar from S3 when AMAZON_COOKIES_S3_BUCKET is set (the same object
// production reads), otherwise from AMAZON_COOKIE_JAR_PATH.
const env = { ...process.env };
if (!process.env.AMAZON_COOKIES_S3_BUCKET?.trim()) {
    const jarSetting = process.env.AMAZON_COOKIE_JAR_PATH?.trim();
    if (!jarSetting) {
        console.error(
            'Set AMAZON_COOKIES_S3_* (the jar `pnpm amazon:refresh-cookies` uploads) or AMAZON_COOKIE_JAR_PATH (a local jar).',
        );
        process.exit(1);
    }
    const jarPath = isAbsolute(jarSetting) ? jarSetting : resolve(repoRoot, jarSetting);
    if (!existsSync(jarPath)) {
        // Start anyway: every call answers COOKIES_MISSING, which is what the API should see.
        console.warn(`No Amazon cookie jar at ${jarPath} yet; the service will report COOKIES_MISSING.`);
    }
    env.AMAZON_COOKIE_JAR_PATH = jarPath;
}

if (await isServiceHealthy()) {
    console.log(`amazon-sync already running at ${syncUrl.origin}; reusing it.`);
    process.exit(0);
}

const child = spawn(serviceVenv(), ['-m', 'amazon_sync'], {
    cwd: workingDir,
    stdio: 'inherit',
    env: {
        ...env,
        AMAZON_SYNC_HOST: '127.0.0.1',
        AMAZON_SYNC_PORT: syncUrl.port || '4022',
        PYTHONUNBUFFERED: '1',
    },
    windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));

async function isServiceHealthy() {
    try {
        const response = await fetch(`${syncUrl.origin}/health`, { signal: AbortSignal.timeout(2000) });
        return response.ok;
    } catch {
        return false;
    }
}
