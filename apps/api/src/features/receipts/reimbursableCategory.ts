import { listCategories } from '../categories/listCategories';
import type { AssignableCategory } from '../categorization/llm/nearbyCategories';
import { assignableCategories, resolveAssignableCategory } from '../categorization/llm/nearbyCategories';
import { parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptSplitDraftCategoryDto } from './receiptsDtos';

export type LoadAssignableCatalog = () => Promise<readonly AssignableCategory[]>;

/** Same category work travel lands in; matched with its emoji folded away. */
const REIMBURSABLE_CATEGORY_NAME = 'Transient / Reimbursable';

/**
 * The category a receipt's written reimbursable share seeds into. Reads the catalog only when the
 * receipt carries such an amount, so ordinary lookups stay a single query.
 */
export async function reimbursableCategoryFor(
    extractJson: string | null | undefined,
    loadCatalog: LoadAssignableCatalog = loadAssignableCatalog,
): Promise<ReceiptSplitDraftCategoryDto | null> {
    if (parseReceiptExtract(extractJson ?? null)?.reimbursable?.amountMilliunits == null) {
        return null;
    }
    const category = resolveAssignableCategory(await loadCatalog(), REIMBURSABLE_CATEGORY_NAME);
    return category ? { id: category.id, name: category.name, groupName: category.groupName } : null;
}

async function loadAssignableCatalog(): Promise<readonly AssignableCategory[]> {
    return assignableCategories((await listCategories()).groups);
}
