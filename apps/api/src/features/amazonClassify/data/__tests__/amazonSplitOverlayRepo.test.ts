import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import type { AmazonSplitOverlayDto } from '../../amazonClassifyDtos';
import {
    deleteAllAmazonSplitOverlays,
    getAmazonSplitOverlay,
    upsertAmazonSplitOverlay,
} from '../amazonSplitOverlayRepo';

describe('amazonSplitOverlayRepo', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-sqlite-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('returns a stored overlay only when the fingerprint matches', async () => {
        await upsertAmazonSplitOverlay('tx-1', 'fp-1', overlay(), database);
        expect(await getAmazonSplitOverlay('tx-1', 'fp-1', database)).toEqual(overlay());
        expect(await getAmazonSplitOverlay('tx-1', 'fp-other', database)).toBeNull();
    });

    it('deletes every stored overlay', async () => {
        await upsertAmazonSplitOverlay('tx-1', 'fp-1', overlay(), database);
        expect(await deleteAllAmazonSplitOverlays(database)).toBe(1);
        expect(await getAmazonSplitOverlay('tx-1', 'fp-1', database)).toBeNull();
    });
});

function overlay(): AmazonSplitOverlayDto {
    return {
        transactionId: 'tx-1',
        dataStatus: 'ready',
        match: 'payment',
        payment: {
            id: 'pay-1',
            paymentDate: '2026-08-01',
            amount: -12340,
            currency: 'USD',
            cardLast4: '1234',
            vendor: 'Amazon.com',
            isRefund: false,
        },
        orders: [
            {
                orderId: '111-222',
                orderDate: '2026-07-30',
                total: -12340,
                tax: -1000,
                shipping: 0,
                promotion: 0,
            },
        ],
        orderIds: ['111-222'],
        items: [
            {
                orderId: '111-222',
                title: 'Paper towels',
                asin: 'B1',
                quantity: 1,
                amount: -12340,
                categoryId: 'cat-h',
                categoryName: '🛒 Household Supplies',
                categoryGroup: 'Living Expenses',
            },
        ],
        lines: [
            {
                amount: -12340,
                categoryId: 'cat-h',
                categoryName: '🛒 Household Supplies',
                categoryGroup: 'Living Expenses',
                memo: 'Paper towels',
            },
        ],
        collapsed: true,
        rationale: 'household paper goods',
        notes: null,
    };
}
