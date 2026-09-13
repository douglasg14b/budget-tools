import type { S3Client } from '@aws-sdk/client-s3';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
} from '@aws-sdk/client-s3';

import type { ReceiptObjectRef, ReceiptStorage } from './receiptStorage';

export type S3ReceiptStorageConfig = {
    readonly client: S3Client;
    readonly bucket: string;
    /** Optional key prefix inside the bucket, e.g. `receipts/`. Normalised to end with `/`. */
    readonly prefix?: string;
};

/**
 * S3-compatible receipt storage (used in production against the on-network rust-fs S3 server).
 * Object keys mirror the filesystem layout under an optional prefix:
 *   {prefix}{id}            original frame 0
 *   {prefix}{id}.{n}        original frame n (n >= 1)
 *   {prefix}{id}.processed  processed image
 */
export class S3ReceiptStorage implements ReceiptStorage {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly prefix: string;

    constructor(config: S3ReceiptStorageConfig) {
        this.client = config.client;
        this.bucket = config.bucket;
        this.prefix = normalisePrefix(config.prefix);
    }

    private keyFor(ref: ReceiptObjectRef): string {
        const base = `${this.prefix}${ref.receiptId}`;
        if (ref.kind === 'processed') {
            return `${base}.processed`;
        }
        return ref.frameIndex === 0 ? base : `${base}.${ref.frameIndex}`;
    }

    async put(ref: ReceiptObjectRef, bytes: Buffer): Promise<void> {
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.keyFor(ref), Body: bytes }));
    }

    async get(ref: ReceiptObjectRef): Promise<Buffer | undefined> {
        try {
            const response = await this.client.send(
                new GetObjectCommand({ Bucket: this.bucket, Key: this.keyFor(ref) }),
            );
            if (!response.Body) {
                return undefined;
            }
            const bytes = await response.Body.transformToByteArray();
            return Buffer.from(bytes);
        } catch (error) {
            if (isNotFound(error)) {
                return undefined;
            }
            throw error;
        }
    }

    async exists(ref: ReceiptObjectRef): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.keyFor(ref) }));
            return true;
        } catch (error) {
            if (isNotFound(error)) {
                return false;
            }
            throw error;
        }
    }

    async delete(ref: ReceiptObjectRef): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.keyFor(ref) }));
    }

    async deleteAll(receiptId: string): Promise<void> {
        const prefix = `${this.prefix}${receiptId}`;
        // A receipt's objects are {id}, {id}.processed, {id}.{n}; all share the {id} prefix.
        // List by prefix and batch-delete. rust-fs supports ListObjectsV2 + DeleteObjects.
        let continuationToken: string | undefined;
        do {
            const listed = await this.client.send(
                new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
            );
            const keys = (listed.Contents ?? [])
                .map((object) => object.Key)
                .filter((key): key is string => typeof key === 'string' && belongsToReceipt(key, prefix));
            if (keys.length > 0) {
                await this.client.send(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: { Objects: keys.map((Key) => ({ Key })) },
                    }),
                );
            }
            continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);
    }

    async countFrames(receiptId: string): Promise<number> {
        if (!(await this.exists({ kind: 'original', receiptId, frameIndex: 0 }))) {
            return 0;
        }
        let count = 1;
        while (await this.exists({ kind: 'original', receiptId, frameIndex: count })) {
            count += 1;
        }
        return count;
    }
}

/**
 * Guards the prefix scan against matching a different receipt whose id starts with this id
 * (e.g. `abc` vs `abcd`). A belonging key is exactly `{prefix}` or `{prefix}` followed by `.`.
 */
function belongsToReceipt(key: string, receiptPrefix: string): boolean {
    return key === receiptPrefix || key.startsWith(`${receiptPrefix}.`);
}

function normalisePrefix(prefix: string | undefined): string {
    if (!prefix) {
        return '';
    }
    const trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    return trimmed ? `${trimmed}/` : '';
}

function isNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
    const httpStatus =
        '$metadata' in error && error.$metadata && typeof error.$metadata === 'object'
            ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
            : undefined;
    return name === 'NoSuchKey' || name === 'NotFound' || httpStatus === 404;
}
