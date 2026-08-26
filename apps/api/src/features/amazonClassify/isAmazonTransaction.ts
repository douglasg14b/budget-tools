export type AmazonPayeeFields = {
    readonly payeeName: string | null;
    readonly importPayeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
};

/**
 * True when bank import/payee text looks like Amazon (not Whole Foods unless AMZN is present).
 */
export function isAmazonTransaction(fields: AmazonPayeeFields): boolean {
    const text = [fields.payeeName, fields.importPayeeName, fields.importPayeeNameOriginal]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(' ')
        .toLowerCase();
    return text.includes('amazon') || text.includes('amzn');
}
