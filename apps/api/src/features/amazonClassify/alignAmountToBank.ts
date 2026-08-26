/**
 * Amazon invoice amounts are positive dollars. YNAB bank charges are signed milliunits.
 * Align an Amazon amount onto the bank transaction's sign so splits do not invent inflows.
 */
export function alignAmountToBank(amount: number, bankAmount: number): number {
    if (amount === 0 || bankAmount === 0) {
        return amount;
    }
    return Math.sign(bankAmount) * Math.abs(amount);
}
