import { describe, expect, it } from 'vitest';

import type { PrimaryNavItem } from '../primaryNav';
import { currentPrimaryNav, isPrimaryNavActive, navTarget, PRIMARY_NAV } from '../primaryNav';

describe('primaryNav', () => {
    it('treats /classify/table as Table, not Classify', () => {
        expect(currentPrimaryNav('/classify/table').label).toBe('Table');
        expect(currentPrimaryNav('/classify').label).toBe('Classify');
    });

    it('matches Queue only at the root path', () => {
        expect(currentPrimaryNav('/').label).toBe('Queue');
        expect(currentPrimaryNav('/receipts').label).toBe('Receipts');
        expect(currentPrimaryNav('/repeating').label).toBe('Repeating');
        expect(currentPrimaryNav('/trips').label).toBe('Trips');
    });

    it('preserves search on Queue through Receipts, not Repeating or Trips', () => {
        const search = '?tier=review';
        expect(navTarget(navItem('Queue'), search)).toEqual({ pathname: '/', search });
        expect(navTarget(navItem('Trips'), search)).toBe('/trips');
        expect(navTarget(navItem('Repeating'), search)).toBe('/repeating');
    });

    it('treats nested receipt detail as Receipts, not Queue', () => {
        expect(currentPrimaryNav('/receipts/abc').label).toBe('Receipts');
        expect(isPrimaryNavActive('/receipts/abc', navItem('Receipts'))).toBe(true);
        expect(isPrimaryNavActive('/receipts/abc', navItem('Queue'))).toBe(false);
    });
});

function navItem(label: PrimaryNavItem['label']): PrimaryNavItem {
    const item = PRIMARY_NAV.find((entry) => entry.label === label);
    if (!item) {
        throw new Error(`Missing primary nav item: ${label}`);
    }
    return item;
}
