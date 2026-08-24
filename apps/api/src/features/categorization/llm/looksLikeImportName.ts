import { nameSimilarity } from '../nameSimilarity';

const RAW_PAYEE_SIMILARITY_THRESHOLD = 0.85;

function firstNonEmpty(primary: string | null | undefined, fallback: string | null | undefined): string | null {
    const first = primary?.trim();
    if (first) {
        return first;
    }
    const second = fallback?.trim();
    return second || null;
}

export function isSamePayee(left: string | null | undefined, right: string | null | undefined): boolean {
    const leftName = left?.trim();
    const rightName = right?.trim();
    if (!leftName || !rightName) {
        return false;
    }
    if (leftName.localeCompare(rightName, undefined, { sensitivity: 'accent' }) === 0) {
        return true;
    }
    return nameSimilarity(leftName, rightName) >= 0.99;
}

/**
 * True when the current YNAB payee still looks like the bank import string.
 */
export function looksLikeImportName(
    payeeName: string | null | undefined,
    importOriginal: string | null | undefined,
    importPayee: string | null | undefined,
): boolean {
    const payee = payeeName?.trim();
    if (!payee) {
        return true;
    }
    const bankText = firstNonEmpty(importOriginal, importPayee);
    if (!bankText) {
        return false;
    }
    if (isSamePayee(payee, bankText)) {
        return true;
    }
    return nameSimilarity(payee, bankText) >= RAW_PAYEE_SIMILARITY_THRESHOLD;
}

export function isDirtierThanCurrent(
    suggestedPayee: string,
    currentPayee: string | null | undefined,
    importOriginal: string | null | undefined,
    importPayee: string | null | undefined,
): boolean {
    const current = currentPayee?.trim();
    const bankText = firstNonEmpty(importOriginal, importPayee);
    if (!current || !bankText) {
        return false;
    }
    return nameSimilarity(suggestedPayee, bankText) > nameSimilarity(current, bankText);
}
