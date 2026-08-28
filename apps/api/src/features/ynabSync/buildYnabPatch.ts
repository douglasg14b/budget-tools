import type { ClassificationDecision } from './classificationDecision';

export type YnabPatchSubtransaction = {
    readonly amount: number;
    readonly category_id: string;
    readonly memo: string | null;
};

export type YnabPatchTransaction = {
    readonly id: string;
    readonly approved: true;
    readonly category_id: string | null;
    readonly payee_name?: string;
    readonly subtransactions?: readonly YnabPatchSubtransaction[];
};

/**
 * Builds the YNAB PATCH body for one stored classification decision.
 */
export function buildYnabPatch(transactionId: string, decision: ClassificationDecision): YnabPatchTransaction {
    const payeeName = decision.payeeName;
    if (decision.kind === 'category') {
        return {
            id: transactionId,
            approved: true,
            category_id: decision.categoryId,
            ...(payeeName ? { payee_name: payeeName } : {}),
        };
    }
    return {
        id: transactionId,
        approved: true,
        category_id: null,
        ...(payeeName ? { payee_name: payeeName } : {}),
        subtransactions: decision.lines.map((line) => ({
            amount: line.amount,
            category_id: line.categoryId,
            memo: line.memo,
        })),
    };
}
