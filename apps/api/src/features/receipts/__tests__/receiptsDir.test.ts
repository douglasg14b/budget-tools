import { describe, expect, it } from 'vitest';

import { getReceiptsDir } from '../../../environment';

describe('getReceiptsDir', () => {
    it('resolves the default data directory from the repo root, not apps/api cwd', () => {
        const dir = getReceiptsDir().replaceAll('\\', '/');
        expect(dir).toMatch(/apps\/api\/data\/receipts$/);
        expect(dir).not.toMatch(/apps\/api\/apps\/api/);
    });
});
