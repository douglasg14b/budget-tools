export type ReceiptExtractLine = {
    readonly name: string;
    readonly amountMilliunits: number | null;
    readonly quantity: number | null;
};

export type ArithmeticGateInput = {
    readonly lines: readonly ReceiptExtractLine[];
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly printedMilliunits: number;
};

export type ArithmeticGateResult = {
    readonly gated: boolean;
    readonly linesPlusTaxMinusDiscounts: number | null;
};

/**
 * Lines + tax − discounts must equal the printed total exactly. Any null line amount fails the gate.
 */
export function arithmeticGate(input: ArithmeticGateInput): ArithmeticGateResult {
    const amounts: number[] = [];
    for (const line of input.lines) {
        if (line.amountMilliunits == null) {
            return { gated: false, linesPlusTaxMinusDiscounts: null };
        }
        amounts.push(line.amountMilliunits);
    }
    const linesPlusTaxMinusDiscounts =
        amounts.reduce((sum, amount) => sum + amount, 0) + input.taxMilliunits - input.discountMilliunits;
    return {
        gated: linesPlusTaxMinusDiscounts === input.printedMilliunits,
        linesPlusTaxMinusDiscounts,
    };
}

export function printedTotalsDisagree(
    headerPrintedMilliunits: number | null,
    ocrPrintedMilliunits: number | null,
): boolean {
    return (
        headerPrintedMilliunits != null &&
        ocrPrintedMilliunits != null &&
        headerPrintedMilliunits !== ocrPrintedMilliunits
    );
}
