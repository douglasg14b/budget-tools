#!/usr/bin/env node
// Uploads the trained categorization models to S3 so the scorer container can fetch them at
// startup.
//
// The models (`models/*.zip`) are gitignored — they are large binaries produced by
// `dotnet run -- train`. Coolify builds from a git clone, so they cannot be COPYed into the
// image. Publishing them here decouples retraining from redeploying: retrain, re-run this
// script, restart the scorer.
//
// Objects are written to the receipts bucket under a models prefix (default `models/`), which the
// existing bucket-scoped service-account policy already covers — no extra provisioning needed.
//
// Usage:
//   pnpm upload:models              # reads RECEIPTS_S3_* from .env.local
//   pnpm upload:models --dry-run    # report what would be uploaded
//
// Env (same vars the API already uses, so .env.local works as-is):
//   RECEIPTS_S3_ENDPOINT, RECEIPTS_S3_BUCKET, RECEIPTS_S3_ACCESS_KEY_ID,
//   RECEIPTS_S3_SECRET_ACCESS_KEY, [RECEIPTS_S3_REGION], [RECEIPTS_S3_FORCE_PATH_STYLE]
//   [CATEGORIZATION_MODELS_S3_PREFIX=models/]  — must match the scorer's setting

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** The three artifacts ScoringSession loads. Names must match MlSettings' *ModelPath defaults. */
const MODEL_FILES = ['category-model.zip', 'group-model.zip', 'payee-model.zip'];

function required(name) {
    const value = (process.env[name] ?? '').trim();
    if (!value) {
        console.error(`Missing required env var: ${name}`);
        console.error('Run `pnpm provision:receipts-s3` first, or copy the values into .env.local.');
        process.exit(1);
    }
    return value;
}

function normalisePrefix(value) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return 'models/';
    }
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    const endpoint = required('RECEIPTS_S3_ENDPOINT');
    const bucket = required('RECEIPTS_S3_BUCKET');
    const accessKeyId = required('RECEIPTS_S3_ACCESS_KEY_ID');
    const secretAccessKey = required('RECEIPTS_S3_SECRET_ACCESS_KEY');
    const region = (process.env.RECEIPTS_S3_REGION ?? 'us-east-1').trim();
    const forcePathStyle = (process.env.RECEIPTS_S3_FORCE_PATH_STYLE ?? 'true').trim() !== 'false';
    const prefix = normalisePrefix(process.env.CATEGORIZATION_MODELS_S3_PREFIX);

    const modelsDir = join(repoRoot, (process.env.CATEGORIZATION_MODELS_DIR ?? 'models').trim());

    const missing = MODEL_FILES.filter((file) => !existsSync(join(modelsDir, file)));
    if (missing.length > 0) {
        console.error(`Missing model file(s) in ${modelsDir}: ${missing.join(', ')}`);
        console.error('Train them first: `dotnet run --project apps/categorization-ai -- train`');
        process.exit(1);
    }

    const client = new S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials: { accessKeyId, secretAccessKey },
    });

    console.log(`${dryRun ? 'DRY RUN — ' : ''}uploading to ${endpoint}/${bucket}/${prefix}\n`);

    for (const file of MODEL_FILES) {
        const path = join(modelsDir, file);
        const bytes = readFileSync(path);
        const size = statSync(path).size;
        // Content hash doubles as the change check and as the value the scorer compares against,
        // so an unchanged model is not re-downloaded on every restart.
        const hash = createHash('sha256').update(bytes).digest('hex');
        const key = `${prefix}${file}`;

        const remoteHash = await headContentHash(client, bucket, key);
        if (remoteHash === hash) {
            console.log(`${file.padEnd(20)} ${formatSize(size).padStart(9)}  unchanged, skipped`);
            continue;
        }

        if (!dryRun) {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: bytes,
                    ContentType: 'application/zip',
                    // Read back by the scorer to decide whether its cached copy is current.
                    Metadata: { 'content-sha256': hash },
                }),
            );
        }
        console.log(
            `${file.padEnd(20)} ${formatSize(size).padStart(9)}  ${dryRun ? 'would upload' : 'uploaded'}  ${hash.slice(0, 12)}…`,
        );
    }

    console.log('\nDone.');
    if (!dryRun) {
        console.log('Restart the scorer service to pick up the new models.');
    }
}

/** Returns the stored content hash for an object, or undefined when it does not exist. */
async function headContentHash(client, bucket, key) {
    try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return response.Metadata?.['content-sha256'];
    } catch (error) {
        const status = error?.$metadata?.httpStatusCode;
        if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
            return undefined;
        }
        throw error;
    }
}

function formatSize(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
