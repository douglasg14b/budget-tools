import { describe, expect, it } from 'vitest';

import { amazonOrderUrl } from '../amazonOrderUrl';

describe('amazonOrderUrl', () => {
    it('opens the order-details page for a US order id', () => {
        expect(amazonOrderUrl('111-2222222-3333333')).toBe(
            'https://www.amazon.com/gp/your-account/order-details?orderID=111-2222222-3333333',
        );
    });
});
