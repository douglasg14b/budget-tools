#!/usr/bin/env node
// One-time LOCAL provisioning of receipt-image storage on the on-network rust-fs S3 server.
//
// rust-fs is MinIO-admin-compatible, so this drives the MinIO Client (`mc`) to:
//   1. register an alias to the rust-fs admin endpoint (using ADMIN credentials),
//   2. create the receipts bucket (idempotent),
//   3. create a bucket-scoped IAM policy (least privilege: only this bucket),
//   4. create a service account (access key + secret) bound to that policy,
//   5. print the resulting RECEIPTS_S3_* env vars for the production API.
//
// Run this once from your machine (it needs the rust-fs admin key). It does NOT store the
// generated credentials anywhere — copy them into the API's production environment.
//
// Requirements: the MinIO Client `mc`, either on PATH or dropped into `.tools/` (gitignored).
// Note the old dl.min.io download path now returns HTTP 410; fetch from GitHub releases instead.
//
// RUSTFS_ADMIN_ENDPOINT is the **S3 API endpoint** (the URL an S3 client connects to), NOT the
// web console. The admin API is served on the same port as the S3 API — "ADMIN" here refers to
// the credentials, not a separate address. On MinIO that is typically :9000, with the console on
// :9001. Passing the console URL fails at `mc alias set` rather than producing a broken config.
//
// Usage (env-driven):
//   RUSTFS_ADMIN_ENDPOINT=https://s3.home.lan \
//   RUSTFS_ADMIN_ACCESS_KEY=admin \
//   RUSTFS_ADMIN_SECRET_KEY=... \
//   [RECEIPTS_S3_BUCKET=budget-tools-receipts] \
//   [RECEIPTS_S3_SVCACCOUNT_NAME=budget-tools-api] \
//   pnpm provision:receipts-s3   (or: node scripts/provision-receipts-s3.mjs)

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Resolves the `mc` binary. Prefers a repo-local copy under `.tools/` (gitignored) so this
 * one-time script does not require a system-wide install, falling back to PATH.
 */
function resolveMcBinary() {
    for (const candidate of [join(repoRoot, '.tools', 'mc.exe'), join(repoRoot, '.tools', 'mc')]) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return 'mc';
}

const MC = resolveMcBinary();

function required(name) {
    const value = (process.env[name] ?? '').trim();
    if (!value) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return value;
}

const adminEndpoint = required('RUSTFS_ADMIN_ENDPOINT');
const adminAccessKey = required('RUSTFS_ADMIN_ACCESS_KEY');
const adminSecretKey = required('RUSTFS_ADMIN_SECRET_KEY');
const bucket = (process.env.RECEIPTS_S3_BUCKET ?? 'budget-tools-receipts').trim();
const svcAccountName = (process.env.RECEIPTS_S3_SVCACCOUNT_NAME ?? 'budget-tools-api').trim();
const alias = 'bt-provision';
const policyName = `${bucket}-rw`;

/** Runs `mc` with args, returning stdout. Secrets are passed as args, never logged. */
function mc(args, { capture = false } = {}) {
    try {
        const stdout = execFileSync(MC, args, {
            encoding: 'utf8',
            stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        return stdout;
    } catch (error) {
        console.error(`mc ${redact(args).join(' ')} failed`);
        if (error.stderr) console.error(String(error.stderr));
        process.exit(1);
    }
}

/** Redacts secret-bearing args for logging. */
function redact(args) {
    return args.map((arg) => (arg === adminSecretKey || arg.length >= 32 ? '***' : arg));
}

function ensureMcInstalled() {
    try {
        execFileSync(MC, ['--version'], { stdio: 'ignore' });
    } catch {
        console.error(
            '`mc` (MinIO Client) not found on PATH or in .tools/.\n' +
                'Download it into the repo (no system install needed):\n' +
                '  mkdir -p .tools && curl -sL -o .tools/mc.exe \\\n' +
                '    https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.windows-amd64.RELEASE.2025-08-13T08-35-41Z.exe\n' +
                'Linux/macOS: same URL pattern with mc.linux-amd64.<TAG> / mc.darwin-arm64.<TAG>, saved as .tools/mc.\n' +
                'Latest tag: https://api.github.com/repos/minio/mc/releases/latest',
        );
        process.exit(1);
    }
}

function main() {
    ensureMcInstalled();

    console.log(`Registering alias '${alias}' -> ${adminEndpoint}`);
    mc(['alias', 'set', alias, adminEndpoint, adminAccessKey, adminSecretKey]);

    console.log(`Ensuring bucket '${bucket}'`);
    // `--ignore-existing` makes bucket creation idempotent.
    mc(['mb', '--ignore-existing', `${alias}/${bucket}`]);

    // Least-privilege policy: full object access limited to this bucket.
    const policy = {
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`],
            },
            {
                Effect: 'Allow',
                Action: ['s3:ListBucket', 's3:GetBucketLocation'],
                Resource: [`arn:aws:s3:::${bucket}`],
            },
        ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'bt-s3-policy-'));
    const policyFile = join(dir, 'policy.json');
    try {
        writeFileSync(policyFile, JSON.stringify(policy, null, 2));
        console.log(`Creating/updating policy '${policyName}'`);
        mc(['admin', 'policy', 'create', alias, policyName, policyFile]);

        // Generate the service-account credentials locally so we control (and can print) them.
        const accessKey = `bt-${randomBytes(8).toString('hex')}`;
        const secretKey = randomBytes(24).toString('base64url');

        console.log(`Creating service account '${svcAccountName}' bound to '${policyName}'`);
        mc([
            'admin',
            'user',
            'svcacct',
            'add',
            alias,
            adminAccessKey,
            '--access-key',
            accessKey,
            '--secret-key',
            secretKey,
            '--policy',
            policyFile,
            '--name',
            svcAccountName,
        ]);

        console.log('\n=== Provisioning complete. Set these in the production API environment: ===\n');
        console.log(`RECEIPTS_STORAGE=s3`);
        console.log(`RECEIPTS_S3_ENDPOINT=${adminEndpoint}`);
        console.log(`RECEIPTS_S3_BUCKET=${bucket}`);
        console.log(`RECEIPTS_S3_ACCESS_KEY_ID=${accessKey}`);
        console.log(`RECEIPTS_S3_SECRET_ACCESS_KEY=${secretKey}`);
        console.log(`RECEIPTS_S3_FORCE_PATH_STYLE=true`);
        console.log(`# RECEIPTS_S3_PREFIX=receipts/   # optional`);
        console.log('\nStore the secret now; it is not persisted by this script.');
    } finally {
        rmSync(dir, { recursive: true, force: true });
        // Remove the local admin alias so the admin secret does not linger in mc config.
        try {
            execFileSync(MC, ['alias', 'rm', alias], { stdio: 'ignore' });
        } catch {
            /* best-effort cleanup */
        }
    }
}

main();
