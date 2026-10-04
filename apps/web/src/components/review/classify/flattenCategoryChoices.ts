import type { CategoryGroupDto } from '@budget-tools/web-sdk';

export type CategoryChoice = {
    readonly groupName: string;
    readonly id: string;
    readonly name: string;
};

export type CategorySelectGroup = {
    readonly group: string;
    readonly items: { label: string; value: string }[];
};

/** YNAB's income category ("Inflow: Ready to Assign"); the one real category in Internal Master Category. */
function isReadyToAssignName(name: string): boolean {
    return name.trim().toLowerCase().startsWith('inflow:');
}

/** Mirrors the API's `isAssignableCategory`, which rejects anything else on save. */
function isAssignableCategory(group: { name: string; hidden: boolean }, category: { name: string; hidden: boolean }) {
    if (group.hidden || category.hidden) {
        return false;
    }
    if (isReadyToAssignName(category.name)) {
        return true;
    }
    if (group.name.trim().toLowerCase() === 'internal master category') {
        return false;
    }
    return category.name.trim().toLowerCase() !== 'uncategorized';
}

/**
 * Visible, assignable categories flattened for search and grouped Select data.
 * YNAB placeholders (Uncategorized, the rest of Internal Master Category) are omitted; Ready to Assign is kept.
 */
export function flattenCategoryChoices(groups: readonly CategoryGroupDto[]): CategoryChoice[] {
    const choices: CategoryChoice[] = [];
    for (const group of groups) {
        for (const category of group.categories) {
            if (!isAssignableCategory(group, category)) {
                continue;
            }
            choices.push({ groupName: group.name, id: category.id, name: category.name });
        }
    }
    return choices;
}

export function categorySelectGroups(choices: readonly CategoryChoice[]): CategorySelectGroup[] {
    const itemsByGroup = new Map<string, { label: string; value: string }[]>();
    for (const choice of choices) {
        const items = itemsByGroup.get(choice.groupName) ?? [];
        items.push({ label: choice.name, value: choice.id });
        itemsByGroup.set(choice.groupName, items);
    }

    return [...itemsByGroup.entries()].map(([group, items]) => ({ group, items }));
}

export function choiceById(choices: readonly CategoryChoice[], categoryId: string): CategoryChoice | undefined {
    return choices.find((choice) => choice.id === categoryId);
}
