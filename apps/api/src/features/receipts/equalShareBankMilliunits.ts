/**
 * Equal shares of the bank milliunits. Remainder (from integer division) sits on the last line.
 */
export function equalShareBankMilliunits(bankMilliunits: number, lineCount: number): number[] {
    if (lineCount <= 0) {
        return [];
    }
    if (lineCount === 1) {
        return [bankMilliunits];
    }
    const sign = bankMilliunits < 0 ? -1 : 1;
    const abs = Math.abs(bankMilliunits);
    const base = Math.floor(abs / lineCount);
    const remainder = abs - base * lineCount;
    return Array.from({ length: lineCount }, (_, index) => {
        const extra = index === lineCount - 1 ? remainder : 0;
        return sign * (base + extra);
    });
}
