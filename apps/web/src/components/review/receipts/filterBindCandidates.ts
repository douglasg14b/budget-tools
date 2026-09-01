import type { ReceiptBindCandidateDto } from '@budget-tools/web-sdk';

import { isAmazonTransaction } from '../classify/isAmazonTransaction';
import { transactionMatchesQuery } from '../transactionMatchesQuery';

/**
 * Inbox search over matcher window charges. Amazon payees never bind.
 */
export function filterBindCandidates(
    candidates: readonly ReceiptBindCandidateDto[],
    query: string | undefined,
): ReceiptBindCandidateDto[] {
    return candidates.filter((row) => !isAmazonTransaction(row) && transactionMatchesQuery(row, query));
}
