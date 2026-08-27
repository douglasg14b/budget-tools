import { alignAmountToBank } from './alignAmountToBank';

/**
 * Scale Amazon line items so they sum to the bank charge.
 * Subscribe & Save list prices are larger than the card charge; the LLM must
 * categorize the charged amount, not the list.
 */
export function allocateAmazonItemsToBank<T extends { itemTotalMilliunits: number }>(
    items: readonly T[],
    bankAmountMilliunits: number,
): T[] {
    if (items.length === 0) {
        return [];
    }
    const signed = items.map((item) => ({
        ...item,
        itemTotalMilliunits: alignAmountToBank(item.itemTotalMilliunits, bankAmountMilliunits),
    }));
    const itemSum = signed.reduce((sum, item) => sum + item.itemTotalMilliunits, 0);
    if (itemSum === bankAmountMilliunits) {
        return signed;
    }

    const absBank = Math.abs(bankAmountMilliunits);
    const absSum = signed.reduce((sum, item) => sum + Math.abs(item.itemTotalMilliunits), 0);
    if (absSum === 0) {
        return signed.map((item, index) =>
            index === signed.length - 1 ? { ...item, itemTotalMilliunits: bankAmountMilliunits } : item,
        );
    }

    let allocated = 0;
    return signed.map((item, index) => {
        if (index === signed.length - 1) {
            return { ...item, itemTotalMilliunits: bankAmountMilliunits - allocated };
        }
        const share = Math.round((Math.abs(item.itemTotalMilliunits) / absSum) * absBank);
        const amount = alignAmountToBank(share, bankAmountMilliunits);
        allocated += amount;
        return { ...item, itemTotalMilliunits: amount };
    });
}
