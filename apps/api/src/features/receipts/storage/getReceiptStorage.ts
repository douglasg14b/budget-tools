import { S3Client } from '@aws-sdk/client-s3';

import {
    getReceiptsDir,
    getReceiptsS3AccessKeyId,
    getReceiptsS3Bucket,
    getReceiptsS3Endpoint,
    getReceiptsS3Prefix,
    getReceiptsS3SecretAccessKey,
    RECEIPTS_S3_FORCE_PATH_STYLE,
    RECEIPTS_S3_REGION,
    RECEIPTS_STORAGE,
} from '../../../environment';
import { FilesystemReceiptStorage } from './filesystemReceiptStorage';
import type { ReceiptStorage } from './receiptStorage';
import { S3ReceiptStorage } from './s3ReceiptStorage';

let cached: ReceiptStorage | undefined;

/**
 * Returns the configured receipt storage provider (filesystem or S3), created once. Selection is
 * driven by `RECEIPTS_STORAGE`; the S3 branch fails loud if its required config is missing.
 */
export function getReceiptStorage(): ReceiptStorage {
    if (!cached) {
        cached = createReceiptStorage();
    }
    return cached;
}

function createReceiptStorage(): ReceiptStorage {
    if (RECEIPTS_STORAGE === 's3') {
        return createS3ReceiptStorage();
    }
    return new FilesystemReceiptStorage(getReceiptsDir());
}

function createS3ReceiptStorage(): S3ReceiptStorage {
    const endpoint = getReceiptsS3Endpoint();
    const bucket = getReceiptsS3Bucket();
    const accessKeyId = getReceiptsS3AccessKeyId();
    const secretAccessKey = getReceiptsS3SecretAccessKey();

    const missing = [
        ['RECEIPTS_S3_ENDPOINT', endpoint],
        ['RECEIPTS_S3_BUCKET', bucket],
        ['RECEIPTS_S3_ACCESS_KEY_ID', accessKeyId],
        ['RECEIPTS_S3_SECRET_ACCESS_KEY', secretAccessKey],
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
    if (missing.length > 0) {
        throw new Error(`RECEIPTS_STORAGE=s3 but missing required config: ${missing.join(', ')}`);
    }

    const client = new S3Client({
        region: RECEIPTS_S3_REGION,
        endpoint,
        forcePathStyle: RECEIPTS_S3_FORCE_PATH_STYLE,
        credentials: {
            accessKeyId: accessKeyId as string,
            secretAccessKey: secretAccessKey as string,
        },
    });

    return new S3ReceiptStorage({ client, bucket: bucket as string, prefix: getReceiptsS3Prefix() });
}

/** Test seam: override the cached provider (e.g. an in-memory or temp-dir filesystem store). */
export function setReceiptStorageForTests(storage: ReceiptStorage | undefined): void {
    cached = storage;
}
