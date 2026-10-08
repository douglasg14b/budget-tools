import type { Selectable } from 'kysely';

export type CategorySmoothingTable = {
    categoryId: string;
    windowDays: number;
    updatedAt: string;
};

export type CategorySmoothingRow = Selectable<CategorySmoothingTable>;
