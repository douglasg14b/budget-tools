import type { CategoriesDto } from '../categories/categoriesDtos';
import { isExcludedCategoryGroup, isExcludedCategoryName } from './classificationDecision';

/**
 * Assignable YNAB category ids: visible, not placeholder, not Internal Master Category.
 */
export function assignableCategoryIds(catalog: CategoriesDto): Set<string> {
    const ids = new Set<string>();
    for (const group of catalog.groups) {
        if (group.hidden || isExcludedCategoryGroup(group.name)) {
            continue;
        }
        for (const category of group.categories) {
            if (category.hidden || isExcludedCategoryName(category.name)) {
                continue;
            }
            ids.add(category.id);
        }
    }
    return ids;
}
