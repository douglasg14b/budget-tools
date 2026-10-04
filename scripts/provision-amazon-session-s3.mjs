#!/usr/bin/env node
// One-time LOCAL provisioning of the bucket that holds the Amazon cookie jar.
//
// A separate bucket and service account from receipts, on purpose: the jar is a live Amazon
// session, so leaked receipt credentials must not be able to read it, and vice versa.
// Same `mc` flow as provision-receipts-s3.mjs (see that file for the details and how to get `mc`).
//
// Reads the RUSTFS_ADMIN_* key from .env.local, and saves the new AMAZON_COOKIES_S3_* settings
// back into .env.local, so `pnpm amazon:refresh-cookies` works straight after. Does nothing if
// they are already there, unless --force, which rotates: a new service account is created and
// saved, then the old one is deleted.
//
// Usage:
//   pnpm provision:amazon-session-s3 [--force]
//
// Env (.env.local): RUSTFS_ADMIN_ENDPOINT, RUSTFS_ADMIN_ACCESS_KEY, RUSTFS_ADMIN_SECRET_KEY,
//   [AMAZON_COOKIES_S3_BUCKET=budget-tools-amazon-session],
//   [AMAZON_COOKIES_S3_SVCACCOUNT_NAME=budget-tools-amazon-sync]

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenvx from '@dotenvx/dotenvx';

import { provisionS3Bucket } from './lib/provisionS3Bucket.mjs';

const envFile = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env.local');

const existingAccessKey = (process.env.AMAZON_COOKIES_S3_ACCESS_KEY_ID ?? '').trim();
if (existingAccessKey && !process.argv.includes('--force')) {
    console.log('Already provisioned: AMAZON_COOKIES_S3_* is set in .env.local.');
    console.log('Next: pnpm amazon:refresh-cookies');
    console.log('(Pass --force to rotate: create a new service account, save it, and delete the old one.)');
    process.exit(0);
}

provisionS3Bucket({
    previousAccessKey: existingAccessKey || undefined,
    bucket: (process.env.AMAZON_COOKIES_S3_BUCKET ?? '').trim() || 'budget-tools-amazon-session',
    svcAccountName: (process.env.AMAZON_COOKIES_S3_SVCACCOUNT_NAME ?? '').trim() || 'budget-tools-amazon-sync',
    onProvisioned: ({ endpoint, bucket, accessKey, secretKey }) => {
        const settings = {
            AMAZON_COOKIES_S3_ENDPOINT: endpoint,
            AMAZON_COOKIES_S3_BUCKET: bucket,
            AMAZON_COOKIES_S3_ACCESS_KEY_ID: accessKey,
            AMAZON_COOKIES_S3_SECRET_ACCESS_KEY: secretKey,
            AMAZON_COOKIES_S3_FORCE_PATH_STYLE: 'true',
        };
        try {
            saveToEnvFile(settings);
        } catch (error) {
            // The secret exists nowhere else, so don't lose it to a failed write.
            console.error(`\nCould not write ${envFile}: ${error.message}`);
            console.error('Add these to .env.local by hand; the secret is not stored anywhere else:\n');
            for (const [key, value] of Object.entries(settings)) {
                console.log(`${key}=${value}`);
            }
            process.exit(1);
        }
        console.log(`\n=== Provisioned s3://${bucket}. Saved to ${envFile}: ===`);
        for (const key of Object.keys(settings)) {
            console.log(`  ${key}`);
        }
        console.log('\nNext: pnpm amazon:refresh-cookies');
        console.log('Production (Phase 7): the amazon-sync service needs the same AMAZON_COOKIES_S3_* values.');
    },
});

/** Updates each key in place, or appends it, leaving the rest of the file untouched. */
function saveToEnvFile(settings) {
    if (!existsSync(envFile)) {
        writeFileSync(envFile, '');
    }
    for (const [key, value] of Object.entries(settings)) {
        // dotenvx computes the new file contents; writing them is the caller's job.
        for (const processed of dotenvx.set(key, value, { path: envFile, plain: true }).processedEnvs) {
            if (processed.error) {
                throw processed.error;
            }
            writeFileSync(processed.filepath, processed.envSrc);
        }
    }
}
