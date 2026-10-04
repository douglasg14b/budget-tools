import { isAssignableCategory } from '../categories/assignableCategory';
import type { CategoriesDto } from '../categories/categoriesDtos';

/**
 * Assignable YNAB category ids: visible, not a placeholder. Ready to Assign is assignable.
 */
export function assignableCategoryIds(catalog: CategoriesDto): Set<string> {
    const ids = new Set<string>();
    for (const group of catalog.groups) {
        for (const category of group.categories) {
            if (isAssignableCategory(group, category)) {
                ids.add(category.id);
            }
        }
    }
    return ids;
}
