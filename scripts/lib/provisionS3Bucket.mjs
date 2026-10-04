// Shared core of the one-time S3 provisioning scripts (provision-receipts-s3.mjs,
// provision-amazon-session-s3.mjs). See provision-receipts-s3.mjs for the full story.
//
// rust-fs is MinIO-admin-compatible, so this drives the MinIO Client (`mc`) to:
//   1. register an alias to the rust-fs admin endpoint (using ADMIN credentials),
//   2. create the bucket (idempotent),
//   3. create a bucket-scoped IAM policy (least privilege: only this bucket),
//   4. create a service account (access key + secret) bound to that policy,
//   5. hand the credentials to `onProvisioned`, which prints or saves them under its own names.
//
// RUSTFS_ADMIN_ENDPOINT is the **S3 API endpoint**, NOT the web console. The admin API is
// served on the same port as the S3 API; "ADMIN" refers to the credentials.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// Pinned so a provisioning run is repeatable. The old dl.min.io path returns HTTP 410; GitHub
// releases still serve it. Latest: https://api.github.com/repos/minio/mc/releases/latest
const MC_RELEASE = 'RELEASE.2025-08-13T08-35-41Z';
const MC_PLATFORMS = {
    'win32-x64': 'windows-amd64',
    'linux-x64': 'linux-amd64',
    'linux-arm64': 'linux-arm64',
    'darwin-x64': 'darwin-amd64',
    'darwin-arm64': 'darwin-arm64',
};

/**
 * Resolves the `mc` binary: a repo-local copy under `.tools/` (gitignored), then PATH, and
 * otherwise downloads the pinned release into `.tools/` so nothing needs installing by hand.
 */
export function resolveMcBinary() {
    const local = join(repoRoot, '.tools', process.platform === 'win32' ? 'mc.exe' : 'mc');
    for (const candidate of [local, 'mc']) {
        if (candidate === 'mc' || existsSync(candidate)) {
            try {
                execFileSync(candidate, ['--version'], { stdio: 'ignore' });
                return candidate;
            } catch {
                /* try the next one */
            }
        }
    }

    const platform = MC_PLATFORMS[`${process.platform}-${process.arch}`];
    if (!platform) {
        console.error(`No mc download for ${process.platform}-${process.arch}; put mc on PATH or in .tools/.`);
        process.exit(1);
    }
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const url = `https://github.com/minio/mc/releases/download/${MC_RELEASE}/mc.${platform}.${MC_RELEASE}${suffix}`;
    console.log(`Downloading the MinIO Client (mc) into .tools/ ...`);
    mkdirSync(dirname(local), { recursive: true });
    try {
        execFileSync('curl', ['-sSfL', '-o', local, url], { stdio: 'inherit' });
        chmodSync(local, 0o755);
        execFileSync(local, ['--version'], { stdio: 'ignore' });
    } catch {
        rmSync(local, { force: true });
        console.error(`Could not download mc from ${url}. Put mc on PATH or in .tools/ and run this again.`);
        process.exit(1);
    }
    return local;
}

export function required(name) {
    const value = (process.env[name] ?? '').trim();
    if (!value) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return value;
}

/**
 * Provisions `bucket` and a service account limited to it.
 * `onProvisioned({ endpoint, bucket, accessKey, secretKey })` prints or saves the settings.
 * `previousAccessKey`, when given, is a service account to delete once the new one is saved.
 */
export function provisionS3Bucket({ bucket, svcAccountName, onProvisioned, previousAccessKey }) {
    const MC = resolveMcBinary();
    const adminEndpoint = required('RUSTFS_ADMIN_ENDPOINT');
    const adminAccessKey = required('RUSTFS_ADMIN_ACCESS_KEY');
    const adminSecretKey = required('RUSTFS_ADMIN_SECRET_KEY');
    const alias = 'bt-provision';
    const policyName = `${bucket}-rw`;

    // Every credential, admin and generated, including key ids: an id names an account an
    // attacker can then target, so it doesn't belong in a log either.
    const credentials = new Set([adminAccessKey, adminSecretKey]);

    /** Redacts credential args for logging. */
    const redact = (args) => args.map((arg) => (credentials.has(arg) || arg.length >= 32 ? '***' : arg));
    const redactText = (text) => [...credentials].reduce((out, secret) => out.split(secret).join('***'), text);

    /**
     * Runs `mc` with args. Secrets are passed as args, never logged. `quiet` captures mc's own
     * output, for commands that echo credentials back (`svcacct add` prints the secret key).
     */
    const mc = (args, { quiet = false } = {}) => {
        try {
            execFileSync(MC, args, { encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
        } catch (error) {
            console.error(`mc ${redact(args).join(' ')} failed`);
            if (error.stdout) console.error(redactText(String(error.stdout)));
            if (error.stderr) console.error(redactText(String(error.stderr)));
            process.exit(1);
        }
    };

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
        credentials.add(accessKey).add(secretKey);

        console.log(`Creating service account '${svcAccountName}' bound to '${policyName}'`);
        mc(
            [
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
            ],
            { quiet: true },
        );

        onProvisioned({ endpoint: adminEndpoint, bucket, accessKey, secretKey });

        // A rotation: the new account works and is saved, so retire the one it replaces.
        if (previousAccessKey) {
            credentials.add(previousAccessKey);
            try {
                execFileSync(MC, ['admin', 'user', 'svcacct', 'rm', alias, previousAccessKey], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                console.log('Removed the service account it replaces.');
            } catch (error) {
                console.error(
                    `Could not remove the previous service account: ${redactText(String(error.stderr ?? error))}`,
                );
                console.error('Remove it in the rust-fs console; its key id was in AMAZON_COOKIES_S3_ACCESS_KEY_ID.');
            }
        }
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
