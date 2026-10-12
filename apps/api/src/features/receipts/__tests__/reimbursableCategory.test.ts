import { describe, expect, it, vi } from 'vitest';

import { reimbursableCategoryFor } from '../reimbursableCategory';

const catalog = [
    { id: 'cat-coffee', name: '☕ Coffee', groupName: 'Everyday' },
    { id: 'cat-transient', name: '🔄 Transient / Reimbursable', groupName: 'Flex' },
];

describe('reimbursableCategoryFor', () => {
    it('resolves the emoji-prefixed catalog category for a written share', async () => {
        const extractJson = JSON.stringify({ reimbursable: { writtenText: null, amountMilliunits: 5000 } });
        await expect(reimbursableCategoryFor(extractJson, async () => catalog)).resolves.toEqual({
            id: 'cat-transient',
            name: '🔄 Transient / Reimbursable',
            groupName: 'Flex',
        });
    });

    it('skips the catalog read when there is no written share', async () => {
        const loadCatalog = vi.fn(async () => catalog);
        await expect(reimbursableCategoryFor(null, loadCatalog)).resolves.toBeNull();
        await expect(
            reimbursableCategoryFor(
                JSON.stringify({ reimbursable: { writtenText: 'Reimb', amountMilliunits: null } }),
                loadCatalog,
            ),
        ).resolves.toBeNull();
        expect(loadCatalog).not.toHaveBeenCalled();
    });

    it('returns null when the catalog has no such category', async () => {
        const extractJson = JSON.stringify({ reimbursable: { writtenText: null, amountMilliunits: 5000 } });
        await expect(reimbursableCategoryFor(extractJson, async () => catalog.slice(0, 1))).resolves.toBeNull();
    });
});
