import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ReceiptObjectRef, ReceiptStorage } from './receiptStorage';

/**
 * Filesystem-backed receipt storage. Preserves the historical on-disk layout so receipts
 * captured before this abstraction still resolve:
 *   {dir}/{id}            original frame 0
 *   {dir}/{id}.{n}        original frame n (n >= 1)
 *   {dir}/{id}.processed  processed image
 */
export class FilesystemReceiptStorage implements ReceiptStorage {
    constructor(private readonly baseDir: string) {}

    private pathFor(ref: ReceiptObjectRef): string {
        const base = join(this.baseDir, ref.receiptId);
        if (ref.kind === 'processed') {
            return `${base}.processed`;
        }
        return ref.frameIndex === 0 ? base : `${base}.${ref.frameIndex}`;
    }

    async put(ref: ReceiptObjectRef, bytes: Buffer): Promise<void> {
        await mkdir(this.baseDir, { recursive: true });
        await writeFile(this.pathFor(ref), bytes);
    }

    async get(ref: ReceiptObjectRef): Promise<Buffer | undefined> {
        try {
            return await readFile(this.pathFor(ref));
        } catch (error) {
            if (isNotFound(error)) {
                return undefined;
            }
            throw error;
        }
    }

    async exists(ref: ReceiptObjectRef): Promise<boolean> {
        try {
            await access(this.pathFor(ref));
            return true;
        } catch (error) {
            if (isNotFound(error)) {
                return false;
            }
            throw error;
        }
    }

    async delete(ref: ReceiptObjectRef): Promise<void> {
        await unlinkIfPresent(this.pathFor(ref));
    }

    async deleteAll(receiptId: string): Promise<void> {
        const base = join(this.baseDir, receiptId);
        await unlinkIfPresent(base);
        await unlinkIfPresent(`${base}.processed`);
        let index = 1;
        while (true) {
            const extra = `${base}.${index}`;
            if (!(await pathExists(extra))) {
                return;
            }
            await unlinkIfPresent(extra);
            index += 1;
        }
    }

    async countFrames(receiptId: string): Promise<number> {
        const base = join(this.baseDir, receiptId);
        if (!(await pathExists(base))) {
            return 0;
        }
        let count = 1;
        while (await pathExists(`${base}.${count}`)) {
            count += 1;
        }
        return count;
    }
}

function isNotFound(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch (error) {
        if (isNotFound(error)) {
            return false;
        }
        throw error;
    }
}

async function unlinkIfPresent(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch (error) {
        if (!isNotFound(error)) {
            throw error;
        }
    }
}
