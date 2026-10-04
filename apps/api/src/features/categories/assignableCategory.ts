const INTERNAL_MASTER_GROUP = 'internal master category';

/**
 * YNAB's income category ("Inflow: Ready to Assign"). It lives in Internal Master Category but is a real
 * assignment target, unlike the other system placeholders there.
 */
function isReadyToAssignName(name: string): boolean {
    return name.trim().toLowerCase().startsWith('inflow:');
}

/**
 * Whether a YNAB category can be suggested, picked, or synced. Uncategorized and the rest of
 * Internal Master Category are placeholders; Ready to Assign is assignable.
 */
export function isAssignableCategory(
    group: { name: string; hidden: boolean },
    category: { name: string; hidden: boolean },
): boolean {
    if (group.hidden || category.hidden) {
        return false;
    }
    if (isReadyToAssignName(category.name)) {
        return true;
    }
    if (group.name.trim().toLowerCase() === INTERNAL_MASTER_GROUP) {
        return false;
    }
    return category.name.trim().toLowerCase() !== 'uncategorized';
}
