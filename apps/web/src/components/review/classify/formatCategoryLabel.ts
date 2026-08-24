/**
 * Category name with optional group prefix for display.
 */
export function formatCategoryLabel(category: string | null, group: string | null): string | null {
    if (!category) {
        return null;
    }
    return group ? `${group}: ${category}` : category;
}
