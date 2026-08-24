import type { TravelWindowHitDto } from '../categorizationDtos';
import type { RankedSimilarTransaction } from '../pickSimilarTransactions';
import type { AssignableCategory } from './nearbyCategories';
import { resolveAssignableCategory } from './nearbyCategories';
import { isVacationGroupName, mapEverydayCategory } from './vacationCategoryMap';

export function requiresTripAlternate(travelWindow: TravelWindowHitDto | null | undefined): boolean {
    return Boolean(travelWindow && travelWindow.locationMatch !== 'mismatch');
}

/**
 * Second LLM category: the model's alternate, or a trip everyday counterpart from similar txs / name mapping.
 */
export function resolveLlmAlternate(input: {
    readonly catalog: readonly AssignableCategory[];
    readonly primary: AssignableCategory;
    readonly predictedAlternate: AssignableCategory | null;
    readonly similar: readonly RankedSimilarTransaction[];
    readonly travelWindow: TravelWindowHitDto | null;
}): AssignableCategory | null {
    if (input.predictedAlternate && input.predictedAlternate.id !== input.primary.id) {
        return input.predictedAlternate;
    }
    if (!requiresTripAlternate(input.travelWindow)) {
        return null;
    }

    const everydaySimilar = similarCategory(input, true);
    if (everydaySimilar) {
        return everydaySimilar;
    }

    const mapped = mapEverydayCategory(input.primary.name, input.catalog);
    if (mapped && mapped.id !== input.primary.id) {
        return mapped;
    }

    return similarCategory(input, false);
}

function similarCategory(
    input: {
        readonly catalog: readonly AssignableCategory[];
        readonly primary: AssignableCategory;
        readonly similar: readonly RankedSimilarTransaction[];
    },
    everydayOnly: boolean,
): AssignableCategory | null {
    for (const example of input.similar) {
        const resolved = resolveAssignableCategory(input.catalog, example.categoryName, example.categoryGroup);
        if (!resolved || resolved.id === input.primary.id) {
            continue;
        }
        if (everydayOnly && isVacationGroupName(resolved.groupName)) {
            continue;
        }
        return resolved;
    }
    return null;
}
