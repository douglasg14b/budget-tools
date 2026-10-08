import { getDatabase } from '../../data/database';
import type { AppDatabaseClient } from '../../data-persistence/database';
import { QueryValidationError } from '../categorization/filterQueue';
import { NotFoundError } from '../travelWindows/HttpError';
import { loadSmoothingWindows, saveSmoothingWindow } from './data/categorySmoothingRepo';
import { loadDailyCategorySpend } from './loadDailyCategorySpend';
import { smoothDailySeries } from './smoothDailySeries';
import type { CategorySmoothingDto, SpendChartCategoryDto, SpendChartDto } from './spendChartDtos';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366 * 3;
const MAX_WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily spend per category between two ISO dates inclusive, with smoothed categories spread
 * forward over their window. Purchases up to `window - 1` days before `startDate` are loaded
 * too, so a big shop just before the range still shows up in its first days.
 */
export async function buildSpendChart(
    startDate: string,
    endDate: string,
    db?: AppDatabaseClient,
): Promise<SpendChartDto> {
    const start = parseIsoDate(startDate, 'start');
    const end = parseIsoDate(endDate, 'end');
    if (end < start) {
        throw new QueryValidationError('end must not be before start');
    }
    const rangeDays = Math.round((end - start) / DAY_MS) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
        throw new QueryValidationError(`Range is limited to ${MAX_RANGE_DAYS} days`);
    }

    const windows = await loadSmoothingWindows(db);
    const lead = Math.max(1, ...windows.values()) - 1;
    const fetchStart = start - lead * DAY_MS;
    const rows = await loadDailyCategorySpend(formatIsoDate(fetchStart), endDate);

    type Accumulator = Omit<SpendChartCategoryDto, 'windowDays' | 'totalMilliunits' | 'dailyMilliunits'> & {
        daily: number[];
    };
    const byCategory = new Map<string, Accumulator>();
    for (const row of rows) {
        let category = byCategory.get(row.categoryId);
        if (!category) {
            category = {
                categoryId: row.categoryId,
                categoryName: row.categoryName,
                groupName: row.groupName,
                daily: new Array<number>(lead + rangeDays).fill(0),
            };
            byCategory.set(row.categoryId, category);
        }
        const index = Math.round((parseIsoDate(row.day, 'day') - fetchStart) / DAY_MS);
        category.daily[index] = (category.daily[index] ?? 0) + row.spentMilliunits;
    }

    const categories: SpendChartCategoryDto[] = [];
    for (const category of byCategory.values()) {
        const windowDays = windows.get(category.categoryId) ?? 1;
        const smoothed = smoothDailySeries(category.daily, windowDays).slice(lead);
        const totalMilliunits = category.daily.slice(lead).reduce((sum, value) => sum + value, 0);
        if (totalMilliunits === 0 && smoothed.every((value) => value === 0)) {
            continue;
        }
        categories.push({
            categoryId: category.categoryId,
            categoryName: category.categoryName,
            groupName: category.groupName,
            windowDays,
            totalMilliunits,
            dailyMilliunits: smoothed.map((value) => Math.round(value)),
        });
    }
    categories.sort((a, b) => b.totalMilliunits - a.totalMilliunits || a.categoryName.localeCompare(b.categoryName));

    const days = Array.from({ length: rangeDays }, (_, index) => formatIsoDate(start + index * DAY_MS));
    return { startDate, endDate, days, categories };
}

export async function setCategorySmoothing(
    categoryId: string,
    windowDays: number,
    db?: AppDatabaseClient,
): Promise<CategorySmoothingDto> {
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > MAX_WINDOW_DAYS) {
        throw new QueryValidationError(`windowDays must be a whole number from 1 to ${MAX_WINDOW_DAYS}`);
    }
    const category = await getDatabase()
        .selectFrom('categories')
        .select('id')
        .where('id', '=', categoryId)
        .executeTakeFirst();
    if (!category) {
        throw new NotFoundError(`Category ${categoryId} was not found`);
    }
    await saveSmoothingWindow(categoryId, windowDays, db);
    return { categoryId, windowDays };
}

/** Milliseconds since epoch at UTC midnight; day arithmetic stays exact in any server timezone. */
function parseIsoDate(value: string, label: string): number {
    if (!ISO_DATE.test(value)) {
        throw new QueryValidationError(`${label} must be a YYYY-MM-DD date`);
    }
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed) || formatIsoDate(parsed) !== value) {
        throw new QueryValidationError(`${label} is not a real date: ${value}`);
    }
    return parsed;
}

function formatIsoDate(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10);
}
