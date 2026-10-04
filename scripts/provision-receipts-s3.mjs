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

import { provisionS3Bucket } from './lib/provisionS3Bucket.mjs';

provisionS3Bucket({
    bucket: (process.env.RECEIPTS_S3_BUCKET ?? 'budget-tools-receipts').trim(),
    svcAccountName: (process.env.RECEIPTS_S3_SVCACCOUNT_NAME ?? 'budget-tools-api').trim(),
    onProvisioned: ({ endpoint, bucket, accessKey, secretKey }) => {
        console.log('\n=== Provisioning complete. Set these in the production API environment: ===\n');
        console.log(`RECEIPTS_STORAGE=s3`);
        console.log(`RECEIPTS_S3_ENDPOINT=${endpoint}`);
        console.log(`RECEIPTS_S3_BUCKET=${bucket}`);
        console.log(`RECEIPTS_S3_ACCESS_KEY_ID=${accessKey}`);
        console.log(`RECEIPTS_S3_SECRET_ACCESS_KEY=${secretKey}`);
        console.log(`RECEIPTS_S3_FORCE_PATH_STYLE=true`);
        console.log(`# RECEIPTS_S3_PREFIX=receipts/   # optional`);
        console.log('\nStore the secret now; it is not persisted by this script.');
    },
});
