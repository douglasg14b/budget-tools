export type ReceiptExtractLine = {
    readonly name: string;
    readonly amountMilliunits: number | null;
    readonly quantity: number | null;
};

export type ArithmeticGateInput = {
    readonly lines: readonly ReceiptExtractLine[];
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly tipMilliunits: number;
    readonly printedMilliunits: number;
};

export type ArithmeticGateResult = {
    readonly gated: boolean;
    readonly computedTotalMilliunits: number | null;
};

/**
 * Lines + tax − discounts + tip must equal the grand total exactly. Any null line amount fails the gate.
 */
export function arithmeticGate(input: ArithmeticGateInput): ArithmeticGateResult {
    const amounts: number[] = [];
    for (const line of input.lines) {
        if (line.amountMilliunits == null) {
            return { gated: false, computedTotalMilliunits: null };
        }
        amounts.push(line.amountMilliunits);
    }
    const computedTotalMilliunits =
        amounts.reduce((sum, amount) => sum + amount, 0) +
        input.taxMilliunits -
        input.discountMilliunits +
        input.tipMilliunits;
    return {
        gated: computedTotalMilliunits === input.printedMilliunits,
        computedTotalMilliunits,
    };
}

export function printedTotalsDisagree(
    headerPrintedMilliunits: number | null,
    linesPrintedMilliunits: number | null,
): boolean {
    return (
        headerPrintedMilliunits != null &&
        linesPrintedMilliunits != null &&
        headerPrintedMilliunits !== linesPrintedMilliunits
    );
}
