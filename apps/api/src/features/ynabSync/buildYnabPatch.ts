import type { ClassificationAnnotations, ClassificationDecision } from './classificationDecision';
import type { YnabFlagColor } from './ynabFlagColor';

export type YnabPatchSubtransaction = {
    readonly amount: number;
    readonly category_id: string;
    readonly memo: string | null;
};

/**
 * One transaction in a YNAB bulk PATCH. Absent optional fields are left unchanged by YNAB;
 * `memo` / `flag_color` null clears them.
 */
export type YnabPatchTransaction = {
    readonly id: string;
    readonly approved: boolean;
    readonly category_id?: string | null;
    readonly payee_name?: string;
    readonly memo?: string | null;
    readonly flag_color?: YnabFlagColor | null;
    readonly subtransactions?: readonly YnabPatchSubtransaction[];
};

/**
 * Builds the YNAB PATCH body for one stored classification decision.
 */
export function buildYnabPatch(transactionId: string, decision: ClassificationDecision): YnabPatchTransaction {
    const annotations = annotationFields(decision);
    if (decision.kind === 'annotate') {
        return { id: transactionId, approved: decision.approved, ...annotations };
    }
    const payee = decision.payeeName ? { payee_name: decision.payeeName } : {};
    if (decision.kind === 'category') {
        return {
            id: transactionId,
            approved: true,
            category_id: decision.categoryId,
            ...payee,
            ...annotations,
        };
    }
    return {
        id: transactionId,
        approved: true,
        category_id: null,
        ...payee,
        ...annotations,
        subtransactions: decision.lines.map((line) => ({
            amount: line.amount,
            category_id: line.categoryId,
            memo: line.memo,
        })),
    };
}

function annotationFields(annotations: ClassificationAnnotations): Pick<YnabPatchTransaction, 'memo' | 'flag_color'> {
    return {
        ...(annotations.memo === undefined ? {} : { memo: annotations.memo }),
        ...(annotations.flagColor === undefined ? {} : { flag_color: annotations.flagColor }),
    };
}
