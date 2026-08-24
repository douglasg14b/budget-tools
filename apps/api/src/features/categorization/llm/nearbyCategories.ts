import type { CategoryGroupDto } from '../../categories/categoriesDtos';
import type { CategoryOptionDto, TravelWindowHitDto } from '../categorizationDtos';
import type { RankedSimilarTransaction } from '../pickSimilarTransactions';
import { isTripsSavingsName, isVacationGroupName, mapVacationCategory } from './vacationCategoryMap';

export type AssignableCategory = {
    readonly id: string;
    readonly name: string;
    readonly groupName: string;
};

export type NearbyCategory = AssignableCategory & {
    readonly why: string;
};

export type NearbyCategorySet = {
    readonly likely: NearbyCategory[];
    readonly siblings: AssignableCategory[];
    readonly pickList: AssignableCategory[];
};

function isExcludedCategoryGroup(groupName: string): boolean {
    return groupName.toLowerCase() === 'internal master category';
}

function isExcludedCategoryName(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'uncategorized' || lower.startsWith('inflow:');
}

function categoryKey(name: string, groupName: string): string {
    return `${groupName.trim().toLowerCase()}\0${name.trim().toLowerCase()}`;
}

/**
 * Visible, assignable categories. Same filter as the classify picker.
 */
export function assignableCategories(groups: readonly CategoryGroupDto[]): AssignableCategory[] {
    const choices: AssignableCategory[] = [];
    for (const group of groups) {
        if (group.hidden || isExcludedCategoryGroup(group.name)) {
            continue;
        }
        for (const category of group.categories) {
            if (category.hidden || isExcludedCategoryName(category.name)) {
                continue;
            }
            choices.push({ id: category.id, name: category.name, groupName: group.name });
        }
    }
    return choices;
}

export function resolveAssignableCategory(
    catalog: readonly AssignableCategory[],
    categoryName: string,
    categoryGroupName?: string | null,
): AssignableCategory | null {
    const parsed = parseModelCategory(categoryName, categoryGroupName);
    if (!parsed.name) {
        return null;
    }
    const byName = catalog.filter((category) => normalizeLabel(category.name) === parsed.name);
    if (byName.length === 0) {
        return null;
    }
    if (parsed.groupName) {
        return byName.find((category) => normalizeLabel(category.groupName) === parsed.groupName) ?? byName[0] ?? null;
    }
    return byName[0] ?? null;
}

function normalizeLabel(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseModelCategory(
    categoryName: string,
    categoryGroupName?: string | null,
): { name: string; groupName: string | null } {
    const rawName = categoryName.trim();
    const fallbackGroup = categoryGroupName?.trim() || null;
    const pipeParts = rawName.split('|').map((part) => part.trim());
    if (pipeParts.length === 2 && pipeParts[0] && pipeParts[1]) {
        return { name: normalizeLabel(pipeParts[0]), groupName: normalizeLabel(pipeParts[1]) };
    }
    const colonParts = rawName.split(':').map((part) => part.trim());
    if (colonParts.length === 2 && colonParts[0] && colonParts[1]) {
        return { name: normalizeLabel(colonParts[1]), groupName: normalizeLabel(colonParts[0]) };
    }
    return {
        name: normalizeLabel(rawName),
        groupName: fallbackGroup ? normalizeLabel(fallbackGroup) : null,
    };
}

/**
 * Nearby set for the prompt: example categories, local options, periodic series, and siblings.
 * Pick list is that set plus the rest of the assignable catalog so the model is not trapped in the wrong group.
 */
export function buildNearbyCategories(input: {
    readonly catalog: readonly AssignableCategory[];
    readonly similar: readonly RankedSimilarTransaction[];
    readonly options: readonly CategoryOptionDto[];
    readonly periodicCategory: string | null;
    readonly travelWindow?: TravelWindowHitDto | null;
}): NearbyCategorySet {
    const byKey = new Map(input.catalog.map((category) => [categoryKey(category.name, category.groupName), category]));
    const likelyByKey = new Map<string, NearbyCategory>();

    function addLikely(name: string, groupName: string | null, why: string): void {
        const resolved =
            (groupName ? byKey.get(categoryKey(name, groupName)) : undefined) ??
            input.catalog.find((category) => normalizeLabel(category.name) === normalizeLabel(name));
        if (!resolved) {
            return;
        }
        const key = categoryKey(resolved.name, resolved.groupName);
        const existing = likelyByKey.get(key);
        if (existing) {
            likelyByKey.set(key, { ...existing, why: `${existing.why}; ${why}` });
            return;
        }
        likelyByKey.set(key, { ...resolved, why });
    }

    const travelExtras: AssignableCategory[] = [];

    function addTravelCategory(name: string, groupName: string | null, why: string, prefer: boolean): void {
        if (prefer) {
            addLikely(name, groupName, why);
            return;
        }
        const resolved =
            (groupName ? byKey.get(categoryKey(name, groupName)) : undefined) ??
            input.catalog.find((category) => normalizeLabel(category.name) === normalizeLabel(name));
        if (!resolved) {
            return;
        }
        travelExtras.push(resolved);
    }

    const similarCounts = new Map<string, { count: number; groupName: string; name: string }>();
    for (const example of input.similar) {
        const key = categoryKey(example.categoryName, example.categoryGroup);
        const existing = similarCounts.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            similarCounts.set(key, {
                count: 1,
                groupName: example.categoryGroup,
                name: example.categoryName,
            });
        }
    }
    for (const entry of similarCounts.values()) {
        addLikely(entry.name, entry.groupName, `${entry.count} similar tx${entry.count === 1 ? '' : 's'}`);
    }

    for (const option of input.options) {
        addLikely(option.category, option.categoryGroup, `local option #${option.rank}`);
    }

    if (input.periodicCategory?.trim()) {
        addLikely(input.periodicCategory, null, 'periodic series');
    }

    const travel = input.travelWindow;
    if (travel) {
        const prefer = travel.locationMatch !== 'mismatch';
        const travelWhy = travel.kind === 'work' ? 'work travel window' : 'vacation travel window';
        if (travel.kind === 'work') {
            const workName = travel.targetCategory ?? 'Transient / Reimbursable';
            addTravelCategory(workName, null, travelWhy, prefer);
        } else {
            const everydayLikely = [...likelyByKey.values()].filter(
                (category) => !isVacationGroupName(category.groupName),
            );
            for (const category of everydayLikely) {
                const counterpart = mapVacationCategory(category.name, input.catalog);
                if (counterpart) {
                    addTravelCategory(
                        counterpart.name,
                        counterpart.groupName,
                        `vacation counterpart of ${category.name}`,
                        prefer,
                    );
                }
            }
            for (const category of input.catalog) {
                if (isVacationGroupName(category.groupName) && !isTripsSavingsName(category.name)) {
                    addTravelCategory(category.name, category.groupName, travelWhy, prefer);
                }
            }
        }
    }

    const likely = [...likelyByKey.values()];
    const likelyGroups = new Set(likely.map((category) => category.groupName.toLowerCase()));
    const likelyKeys = new Set(likely.map((category) => categoryKey(category.name, category.groupName)));
    const siblings = input.catalog.filter(
        (category) =>
            likelyGroups.has(category.groupName.toLowerCase()) &&
            !likelyKeys.has(categoryKey(category.name, category.groupName)),
    );
    const siblingKeys = new Set(siblings.map((category) => categoryKey(category.name, category.groupName)));
    for (const category of travelExtras) {
        const key = categoryKey(category.name, category.groupName);
        if (likelyKeys.has(key) || siblingKeys.has(key)) {
            continue;
        }
        siblings.push(category);
        siblingKeys.add(key);
    }

    const nearby = [...likely, ...siblings];
    const pickList = appendUnique(nearby, input.catalog);

    return { likely, siblings, pickList };
}

function appendUnique(base: readonly AssignableCategory[], extra: readonly AssignableCategory[]): AssignableCategory[] {
    const keys = new Set(base.map((category) => categoryKey(category.name, category.groupName)));
    const result = [...base];
    for (const category of extra) {
        const key = categoryKey(category.name, category.groupName);
        if (keys.has(key)) {
            continue;
        }
        keys.add(key);
        result.push(category);
    }
    return result;
}
