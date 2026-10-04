#!/usr/bin/env node
// Log in to Amazon on this machine and hand the session to the amazon-sync service.
//
//   pnpm amazon:refresh-cookies              log in (email, password, SMS code), verify, upload
//   pnpm amazon:refresh-cookies --jar <path> skip the login: verify an existing jar and upload it
//
// Steps, in this order so a config problem never costs an SMS code:
//   1. Check the AMAZON_COOKIES_S3_* settings and that the bucket answers.
//   2. Create the two venvs on first run: .venv-browser (Playwright, for the login) and .venv
//      (the service's own, no browser, for the check).
//   3. Log in with a headless browser, which solves Amazon's JavaScript challenge, and write
//      the jar to a temp directory.
//   4. Check the session cookies are present, then prove the jar works over plain HTTP using
//      the service's code. A jar that fails here is never uploaded.
//   5. Copy the current object to cookies.previous.json, then upload the new jar. The service
//      picks it up on its next call; no restart.
//
// Prints cookie names, never values. The temp directory is deleted on exit.
//
// Env (from .env.local; `pnpm provision:amazon-session-s3` prints them):
//   AMAZON_COOKIES_S3_ENDPOINT, AMAZON_COOKIES_S3_BUCKET, AMAZON_COOKIES_S3_ACCESS_KEY_ID,
//   AMAZON_COOKIES_S3_SECRET_ACCESS_KEY, [AMAZON_COOKIES_S3_KEY=cookies.json],
//   [AMAZON_COOKIES_S3_REGION=us-east-1], [AMAZON_COOKIES_S3_FORCE_PATH_STYLE=true]

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    CopyObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';

import { ensureVenv, run } from './lib/pythonVenv.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const syncDir = join(repoRoot, 'apps', 'amazon-sync');

/** The cookies that carry the signed-in session. Matches tools/mint_cookie_jar.py. */
const AUTH_COOKIE_NAMES = ['x-main', 'at-main', 'sess-at-main', 'ubid-main', 'session-id'];

function required(name) {
    const value = (process.env[name] ?? '').trim();
    if (!value) {
        console.error(`Missing ${name}.`);
        console.error('Run `pnpm provision:amazon-session-s3` once, then put the values it prints in .env.local.');
        process.exit(1);
    }
    return value;
}

function cookieStoreFromEnv() {
    const endpoint = required('AMAZON_COOKIES_S3_ENDPOINT');
    const bucket = required('AMAZON_COOKIES_S3_BUCKET');
    const accessKeyId = required('AMAZON_COOKIES_S3_ACCESS_KEY_ID');
    const secretAccessKey = required('AMAZON_COOKIES_S3_SECRET_ACCESS_KEY');
    const key = (process.env.AMAZON_COOKIES_S3_KEY ?? '').trim() || 'cookies.json';
    const client = new S3Client({
        region: (process.env.AMAZON_COOKIES_S3_REGION ?? '').trim() || 'us-east-1',
        endpoint,
        forcePathStyle: (process.env.AMAZON_COOKIES_S3_FORCE_PATH_STYLE ?? 'true').trim() !== 'false',
        credentials: { accessKeyId, secretAccessKey },
    });
    return { client, endpoint, bucket, key, previousKey: `${key.replace(/\.json$/, '')}.previous.json` };
}

function parseArgs(argv) {
    const index = argv.indexOf('--jar');
    if (index === -1) {
        return { existingJar: undefined };
    }
    const path = argv[index + 1];
    if (!path) {
        console.error('--jar needs a path.');
        process.exit(1);
    }
    return { existingJar: resolve(process.cwd(), path) };
}

async function main() {
    const { existingJar } = parseArgs(process.argv.slice(2));
    const store = cookieStoreFromEnv();

    try {
        await store.client.send(new HeadBucketCommand({ Bucket: store.bucket }));
    } catch (error) {
        console.error(`Cannot reach s3://${store.bucket} at ${store.endpoint}: ${describeS3Error(error)}`);
        console.error('Nothing was changed. Fix the AMAZON_COOKIES_S3_* settings and run this again.');
        process.exit(1);
    }

    const servicePython = ensureVenv({
        venvDir: join(syncDir, '.venv'),
        requirements: join(syncDir, 'requirements.txt'),
        cwd: syncDir,
    });

    // Deleted on every exit path, including a failed step or Ctrl+C during the login.
    const workDir = mkdtempSync(join(tmpdir(), 'amazon-cookies-'));
    process.on('exit', () => rmSync(workDir, { recursive: true, force: true }));
    process.on('SIGINT', () => {
        // Let Ctrl+C reach the login prompt and fail it, rather than killing this process
        // before the exit handler can run.
    });

    let jarPath = existingJar;
    if (!jarPath) {
        const browserPython = ensureVenv({
            venvDir: join(syncDir, '.venv-browser'),
            requirements: join(syncDir, 'requirements-browser.txt'),
            cwd: syncDir,
            afterInstall: (python) => {
                console.log('Downloading the headless Chromium the login uses ...');
                const status = run(python, ['-m', 'playwright', 'install', 'chromium'], { cwd: syncDir });
                if (status !== 0) {
                    console.error('`playwright install chromium` failed.');
                    process.exit(1);
                }
            },
        });
        jarPath = join(workDir, 'cookies.json');
        if (run(browserPython, [join(syncDir, 'tools', 'mint_cookie_jar.py'), jarPath], { cwd: syncDir }) !== 0) {
            fail('Login did not produce a usable cookie jar.');
        }
    }

    const jar = readFileSync(jarPath);
    const names = cookieNames(jar);
    const missing = AUTH_COOKIE_NAMES.filter((name) => !names.includes(name));
    if (missing.length > 0) {
        fail(`The jar is missing session cookies: ${missing.join(', ')}.`);
    }

    console.log('\nChecking the jar over plain HTTP, the way the server will use it ...');
    if (run(servicePython, ['-m', 'amazon_sync.check_jar', jarPath], { cwd: syncDir }) !== 0) {
        fail('The jar did not work without a browser.');
    }

    const previous = await headObject(store);
    if (previous) {
        await store.client.send(
            new CopyObjectCommand({
                Bucket: store.bucket,
                Key: store.previousKey,
                CopySource: `${store.bucket}/${encodeURIComponent(store.key)}`,
            }),
        );
    }
    await store.client.send(
        new PutObjectCommand({ Bucket: store.bucket, Key: store.key, Body: jar, ContentType: 'application/json' }),
    );

    console.log('\nUploaded a fresh Amazon session.');
    console.log(`  ${names.length} cookies: ${names.join(', ')}`);
    console.log(`  s3://${store.bucket}/${store.key}`);
    if (previous) {
        console.log(`  Previous jar kept as s3://${store.bucket}/${store.previousKey}; ${describeAge(previous)}.`);
    } else {
        console.log('  There was no previous jar.');
    }
    console.log('amazon-sync uses it on its next call; no restart needed.');
}

/** Exits without uploading. Says so, because "is the old jar still there?" is the first question. */
function fail(message) {
    console.error(`\n${message}`);
    console.error('Nothing was uploaded; the jar in S3 is unchanged.');
    process.exit(1);
}

function cookieNames(jar) {
    let parsed;
    try {
        parsed = JSON.parse(jar.toString('utf8'));
    } catch {
        fail('The jar is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail('The jar is not a JSON object of cookie names to values.');
    }
    return Object.keys(parsed).sort();
}

/** The current object's upload time, or undefined when there is none. */
async function headObject(store) {
    try {
        const response = await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: store.key }));
        return response.LastModified ?? new Date(0);
    } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
            return undefined;
        }
        throw error;
    }
}

/** The previous jar's age is also how long a session has lasted, so it is worth printing. */
function describeAge(uploadedAt) {
    const days = (Date.now() - uploadedAt.getTime()) / 86_400_000;
    const age = days < 1 ? 'less than a day' : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`;
    return `it was uploaded ${uploadedAt.toISOString().slice(0, 10)} (${age} ago)`;
}

function describeS3Error(error) {
    const status = error?.$metadata?.httpStatusCode;
    return [error?.name, status ? `HTTP ${status}` : undefined, error?.message].filter(Boolean).join(', ');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
