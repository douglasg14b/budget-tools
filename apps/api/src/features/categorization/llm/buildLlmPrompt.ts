import type { CategorizationProposalDto, TransactionDetailDto } from '../categorizationDtos';
import type { RankedSimilarTransaction } from '../pickSimilarTransactions';
import type { NearbyCategorySet } from './nearbyCategories';

export type LlmPrompt = {
    readonly system: string;
    readonly user: string;
};

function dollars(amountMilliunits: number): string {
    const value = amountMilliunits / 1000;
    const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: 'always',
    }).format(value);
    return `${formatted} USD`;
}

function truncateMemo(memo: string | null): string | null {
    const trimmed = memo?.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function agreedSimilarPayee(similar: readonly RankedSimilarTransaction[]): string | null {
    const names = similar.map((row) => row.payeeName?.trim()).filter((name): name is string => Boolean(name));
    if (names.length === 0) {
        return null;
    }
    const first = names[0];
    if (!first) {
        return null;
    }
    const agreed = names.every((name) => name.localeCompare(first, undefined, { sensitivity: 'accent' }) === 0);
    return agreed ? first : null;
}

/**
 * Builds the JIT categorization prompt: current tx, similar finalized examples, nearby categories.
 */
export function buildLlmPrompt(input: {
    readonly transaction: TransactionDetailDto;
    readonly proposal: CategorizationProposalDto;
    readonly similar: readonly RankedSimilarTransaction[];
    readonly nearby: NearbyCategorySet;
}): LlmPrompt {
    const system = [
        "You categorize personal budget transactions into this household's YNAB categories.",
        'categoryName is the primary pick from the pick list. Never invent a category name.',
        'Set alternateCategoryName to a second pick-list category when a trip/vacation category and an everyday category both fit, or when two categories are genuinely relevant. Otherwise set it to null unless trip context requires both.',
        'When similar finalized transactions exist and clearly agree, follow that household history for what kind of spend this is.',
        'When similar transactions are missing or disagree, use the merchant name and the pick list.',
        "Grocery stores (Safeway, Kroger, Whole Foods, Trader Joe's, and similar) belong in Groceries when that category is on the pick list.",
        'If similar transactions disagree, set confidence below 0.5.',
        'payeeName is a short canonical merchant name, or null if the current payee is already clean.',
        'Do not echo the raw bank import string as the payee.',
        ...(input.proposal.travelWindow ? [travelSystemNote(input.proposal.travelWindow)] : []),
    ].join(' ');

    const lines: string[] = [];
    const tx = input.transaction;
    const flags = input.proposal.flags;

    lines.push('Current transaction:');
    lines.push(`- Date: ${tx.date}`);
    lines.push(`- Amount: ${dollars(tx.amount)}`);
    lines.push(`- Account: ${tx.accountName}`);
    lines.push(`- Payee: ${tx.payeeName?.trim() || '(none)'}`);
    lines.push(`- Import original: ${tx.importPayeeNameOriginal?.trim() || '(none)'}`);
    lines.push(`- Import payee: ${tx.importPayeeName?.trim() || '(none)'}`);
    const memo = truncateMemo(tx.memo);
    if (memo) {
        lines.push(`- Memo: ${memo}`);
    }

    const flagParts = [
        flags.isNovelImport ? 'novel import' : null,
        flags.isAmbiguous ? 'ambiguous merchant' : null,
        flags.isExcluded ? 'excluded payee' : null,
        flags.isPeriodicConflict ? 'periodic conflict' : null,
    ].filter((flag): flag is string => flag !== null);
    if (flagParts.length > 0) {
        lines.push(`- Flags: ${flagParts.join(', ')}`);
    }

    const agreedPayee = agreedSimilarPayee(input.similar);
    if (agreedPayee) {
        lines.push(`- Household payee for similar txs: ${agreedPayee}`);
    }

    const travel = input.proposal.travelWindow;
    if (travel) {
        lines.push('');
        lines.push('Trip context:');
        lines.push(`- Name: ${travel.name}`);
        lines.push(`- Kind: ${travel.kind}`);
        lines.push('- In window by date and card');
        if (travel.location) {
            lines.push(`- Destination: ${travel.location}`);
        }
        if (travel.merchantCity) {
            lines.push(`- Merchant city: ${travel.merchantCity} (${locationMatchLabel(travel.locationMatch)})`);
        } else if (travel.locationMatch === 'unknown') {
            lines.push('- Merchant city: not visible on the import name');
        }
        if (travel.targetCategory) {
            lines.push(`- Mapped trip category: ${travel.targetCategory}`);
        }
        if (travel.kind === 'vacation' && travel.locationMatch !== 'mismatch') {
            lines.push(
                '- Always return two pick-list categories: Vacation-group as categoryName, everyday counterpart as alternateCategoryName. Never leave alternateCategoryName null.',
            );
        }
        if (travel.kind === 'work' && travel.locationMatch !== 'mismatch') {
            lines.push(
                '- Always return two pick-list categories: Transient / Reimbursable as categoryName, everyday counterpart as alternateCategoryName. Never leave alternateCategoryName null.',
            );
        }
    }

    lines.push('');
    lines.push('Similar finalized transactions (newest first):');
    if (input.similar.length === 0) {
        lines.push('(none)');
    } else {
        for (const example of input.similar) {
            const exampleMemo = truncateMemo(example.memo);
            const memoPart = exampleMemo ? ` memo=${exampleMemo}` : '';
            lines.push(
                `- ${example.date}  ${dollars(example.amount)}  ${example.payeeName ?? '(none)'}  [${example.importPayeeNameOriginal ?? ''}]${memoPart}  → ${example.categoryName} | ${example.categoryGroup}`,
            );
        }
    }

    lines.push('');
    lines.push('Likely categories:');
    if (input.nearby.likely.length === 0) {
        lines.push('(none)');
    } else {
        for (const category of input.nearby.likely) {
            lines.push(`- ${category.name} | ${category.groupName} (${category.why})`);
        }
    }

    lines.push('');
    lines.push('Other categories in the same groups:');
    if (input.nearby.siblings.length === 0) {
        lines.push('(none)');
    } else {
        for (const category of input.nearby.siblings) {
            lines.push(`- ${category.name} | ${category.groupName}`);
        }
    }

    lines.push('');
    lines.push('Pick list:');
    for (const category of input.nearby.pickList) {
        lines.push(`- ${category.name} | ${category.groupName}`);
    }

    return { system, user: lines.join('\n') };
}

function travelSystemNote(window: NonNullable<CategorizationProposalDto['travelWindow']>): string {
    const inWindow = `This charge is in trip "${window.name}" by date and card.`;
    const vacationPrefer =
        'Always set both fields. categoryName must be a Vacation-group category, not the Trips + Vacations savings category. alternateCategoryName must be the matching everyday category from the pick list. Never set alternateCategoryName to null.';
    const workPrefer =
        'Always set both fields. categoryName must be Transient / Reimbursable. alternateCategoryName must be the matching everyday category from the pick list. Never set alternateCategoryName to null.';
    switch (window.locationMatch) {
        case 'match': {
            const destination = window.location ? ` ${window.location}` : '';
            const merchant = window.merchantCity ? ` ${window.merchantCity}` : '';
            return window.kind === 'work'
                ? `${inWindow} Merchant city${merchant} matches destination${destination}. ${workPrefer}`
                : `${inWindow} Merchant city matches destination${destination}. ${vacationPrefer}`;
        }
        case 'mismatch': {
            const merchant = window.merchantCity
                ? ` looks like ${window.merchantCity}`
                : ' looks like a different city';
            const destination = window.location ? `, not ${window.location}` : '';
            const allowed =
                window.targetCategory ??
                (window.kind === 'work' ? 'Transient / Reimbursable' : 'a Vacation-group category');
            return `${inWindow} Merchant${merchant}${destination}. Do not assume the trip category; ${allowed} remains allowed. Leave alternateCategoryName null unless two everyday categories both fit.`;
        }
        case 'unknown':
            return window.kind === 'work'
                ? `${inWindow} No city confirmation on the import name. ${workPrefer}`
                : `${inWindow} No city confirmation on the import name. ${vacationPrefer}`;
        case 'unspecified':
            return window.kind === 'work' ? `${inWindow} ${workPrefer}` : `${inWindow} ${vacationPrefer}`;
    }
}

function locationMatchLabel(match: NonNullable<CategorizationProposalDto['travelWindow']>['locationMatch']): string {
    switch (match) {
        case 'match':
            return 'matches destination';
        case 'mismatch':
            return 'does not match destination';
        case 'unknown':
            return 'not confirmed';
        case 'unspecified':
            return 'destination not specified';
    }
}
