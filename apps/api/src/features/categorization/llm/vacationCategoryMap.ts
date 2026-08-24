type NamedCategory = {
    readonly id: string;
    readonly name: string;
    readonly groupName: string;
};

const TAIL_SYNONYMS: Readonly<Record<string, string>> = {
    groceries: 'food',
    grocery: 'food',
    restaurants: 'food',
    restaurant: 'food',
    dining: 'food',
    uber: 'transportation',
    lyft: 'transportation',
    parking: 'transportation',
    taxi: 'transportation',
    transit: 'transportation',
    hotel: 'lodging',
    lodging: 'lodging',
    airbnb: 'lodging',
    airfare: 'lodging',
    flight: 'lodging',
};

export function lettersKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isVacationGroupName(groupName: string): boolean {
    return lettersKey(groupName) === 'vacation';
}

export function isTripsSavingsName(categoryName: string): boolean {
    const key = lettersKey(categoryName);
    return key === 'tripsvacations' || key === 'tripsandvacations';
}

/**
 * Maps an everyday (or already-vacation) category onto the Vacation-group counterpart.
 */
export function mapVacationCategory(winnerName: string, catalog: readonly NamedCategory[]): NamedCategory | null {
    const vacationCategories = catalog.filter(
        (category) => isVacationGroupName(category.groupName) && !isTripsSavingsName(category.name),
    );
    if (vacationCategories.length === 0) {
        return null;
    }

    const winner = catalog.find((category) => lettersKey(category.name) === lettersKey(winnerName));
    if (winner && isVacationGroupName(winner.groupName) && !isTripsSavingsName(winner.name)) {
        return winner;
    }

    const winnerTail = categoryTail(winnerName);
    if (!winnerTail) {
        return null;
    }

    const exact = vacationCategories.find((category) => categoryTail(category.name) === winnerTail);
    if (exact) {
        return exact;
    }

    const synonym = TAIL_SYNONYMS[winnerTail];
    if (synonym) {
        const mapped = vacationCategories.find((category) => categoryTail(category.name) === synonym);
        if (mapped) {
            return mapped;
        }
    }

    const prefixMatches = vacationCategories.filter((category) =>
        tailsLooselyMatch(winnerTail, categoryTail(category.name)),
    );
    return prefixMatches.length === 1 ? (prefixMatches[0] ?? null) : null;
}

/**
 * Maps a Vacation-group category onto the everyday counterpart, or returns the winner when it is already everyday.
 */
export function mapEverydayCategory(winnerName: string, catalog: readonly NamedCategory[]): NamedCategory | null {
    const everydayCategories = catalog.filter((category) => !isVacationGroupName(category.groupName));
    if (everydayCategories.length === 0) {
        return null;
    }

    const winner = catalog.find((category) => lettersKey(category.name) === lettersKey(winnerName));
    if (winner && !isVacationGroupName(winner.groupName)) {
        return winner;
    }

    const winnerTail = categoryTail(winnerName);
    if (!winnerTail) {
        return null;
    }

    const matches = everydayCategories.filter((category) =>
        everydayMatchesVacationTail(categoryTail(category.name), winnerTail),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
}

function everydayMatchesVacationTail(everydayTail: string, vacationTail: string): boolean {
    if (!everydayTail || !vacationTail) {
        return false;
    }
    if (everydayTail === vacationTail) {
        return true;
    }
    if (TAIL_SYNONYMS[everydayTail] === vacationTail) {
        return true;
    }
    return tailsLooselyMatch(everydayTail, vacationTail);
}

function tailsLooselyMatch(left: string, right: string): boolean {
    if (!left || !right) {
        return false;
    }
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    return shorter.length >= 4 && longer.startsWith(shorter);
}

function categoryTail(name: string): string {
    const key = lettersKey(name);
    return key.startsWith('vacation') && key.length > 'vacation'.length ? key.slice('vacation'.length) : key;
}
