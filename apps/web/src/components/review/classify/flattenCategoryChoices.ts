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

function isExcludedCategoryGroup(groupName: string): boolean {
    return groupName.toLowerCase() === 'internal master category';
}

function isExcludedCategoryName(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'uncategorized' || lower.startsWith('inflow:');
}

/**
 * Visible, assignable categories flattened for search and grouped Select data.
 * YNAB placeholders (Uncategorized, Inflow:*, Internal Master Category) are omitted.
 */
export function flattenCategoryChoices(groups: readonly CategoryGroupDto[]): CategoryChoice[] {
    const choices: CategoryChoice[] = [];
    for (const group of groups) {
        if (group.hidden || isExcludedCategoryGroup(group.name)) {
            continue;
        }
        for (const category of group.categories) {
            if (category.hidden || isExcludedCategoryName(category.name)) {
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
