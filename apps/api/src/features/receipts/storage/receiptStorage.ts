/**
 * Receipt image storage abstraction.
 *
 * A receipt owns a small set of binary objects, all derived from the receipt id:
 *  - the original capture, frame 0 (`{ kind: 'original', frameIndex: 0 }`)
 *  - additional original frames 1..N (`{ kind: 'original', frameIndex: n }`)
 *  - the processed (prepped-for-extract) image (`{ kind: 'processed' }`)
 *
 * Providers own the mapping from a `ReceiptObjectRef` to their physical key/path, so callers
 * never construct paths. The filesystem provider is used locally; the S3 provider (on-network
 * rust-fs) is used in production. Select via the `RECEIPTS_STORAGE` env var.
 */
export type ReceiptObjectRef =
    | { readonly kind: 'original'; readonly receiptId: string; readonly frameIndex: number }
    | { readonly kind: 'processed'; readonly receiptId: string };

export interface ReceiptStorage {
    /** Writes (or overwrites) the object's bytes. */
    put(ref: ReceiptObjectRef, bytes: Buffer): Promise<void>;

    /** Reads the object's bytes, or `undefined` if it does not exist. */
    get(ref: ReceiptObjectRef): Promise<Buffer | undefined>;

    /** Whether the object exists. */
    exists(ref: ReceiptObjectRef): Promise<boolean>;

    /** Deletes the object if present; a missing object is not an error. */
    delete(ref: ReceiptObjectRef): Promise<void>;

    /**
     * Deletes every object belonging to a receipt (frame 0, all extra frames, processed).
     * Providers implement this efficiently (e.g. a prefix scan) since the caller does not know
     * how many extra frames exist.
     */
    deleteAll(receiptId: string): Promise<void>;

    /**
     * Number of original frames present for a receipt (0 if none). Counts frame 0 plus
     * contiguous extra frames 1..N, matching the historical `countReceiptFrames` behaviour.
     */
    countFrames(receiptId: string): Promise<number>;
}

export function originalRef(receiptId: string, frameIndex = 0): ReceiptObjectRef {
    return { kind: 'original', receiptId, frameIndex };
}

export function processedRef(receiptId: string): ReceiptObjectRef {
    return { kind: 'processed', receiptId };
}
