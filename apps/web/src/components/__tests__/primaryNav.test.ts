import { describe, expect, it } from 'vitest';

import type { PrimaryNavItem } from '../primaryNav';
import {
    currentMobileTab,
    currentPrimaryNav,
    isMobileTabActive,
    isPrimaryNavActive,
    MOBILE_TABS,
    navTarget,
    PRIMARY_NAV,
} from '../primaryNav';

describe('primaryNav', () => {
    it('treats the card and table layouts as one Classify section', () => {
        expect(currentPrimaryNav('/classify/table').label).toBe('Classify');
        expect(currentPrimaryNav('/classify').label).toBe('Classify');
        expect(PRIMARY_NAV.some((item) => item.label === 'Table')).toBe(false);
    });

    it('matches Queue only at the root path', () => {
        expect(currentPrimaryNav('/').label).toBe('Queue');
        expect(currentPrimaryNav('/receipts').label).toBe('Receipts');
        expect(currentPrimaryNav('/repeating').label).toBe('Repeating');
        expect(currentPrimaryNav('/trips').label).toBe('Trips');
        expect(currentPrimaryNav('/spending').label).toBe('Spending');
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

describe('mobile tabs', () => {
    it('folds Queue, Classify and Table into Review', () => {
        expect(currentMobileTab('/').id).toBe('review');
        expect(currentMobileTab('/classify').id).toBe('review');
        expect(currentMobileTab('/classify/table').id).toBe('review');
    });

    it('keeps Repeating and Trips under Configure', () => {
        expect(currentMobileTab('/configure').id).toBe('configure');
        expect(currentMobileTab('/repeating').id).toBe('configure');
        expect(currentMobileTab('/trips').id).toBe('configure');
    });

    it('treats nested receipt detail as Receipts', () => {
        expect(currentMobileTab('/receipts/abc').id).toBe('receipts');
        expect(currentMobileTab('/spending').id).toBe('spending');
    });

    it('does not let Review claim every path', () => {
        const review = MOBILE_TABS.find((tab) => tab.id === 'review');
        expect(review && isMobileTabActive('/receipts', review)).toBe(false);
    });
});

function navItem(label: PrimaryNavItem['label']): PrimaryNavItem {
    const item = PRIMARY_NAV.find((entry) => entry.label === label);
    if (!item) {
        throw new Error(`Missing primary nav item: ${label}`);
    }
    return item;
}
