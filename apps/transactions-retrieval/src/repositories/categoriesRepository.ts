import type { Category, CategoryGroup, NewCategory, NewCategoryGroup } from '../data';
import { database } from '../data';

export interface CategoriesRepository {
    upsertCategoryGroup(categoryGroup: NewCategoryGroup): Promise<void>;
    upsertCategory(category: NewCategory): Promise<void>;
    getCategoryGroup(id: string): Promise<CategoryGroup | undefined>;
    getCategory(id: string): Promise<Category | undefined>;
}

class DatabaseCategoriesRepository implements CategoriesRepository {
    public async upsertCategoryGroup(categoryGroup: NewCategoryGroup): Promise<void> {
        await database
            .insertInto('category_groups')
            .values(categoryGroup)
            .onConflict((oc) => oc.column('id').doUpdateSet(categoryGroup))
            .execute();
    }

    public async upsertCategory(category: NewCategory): Promise<void> {
        await database
            .insertInto('categories')
            .values(category)
            .onConflict((oc) => oc.column('id').doUpdateSet(category))
            .execute();
    }

    public async getCategoryGroup(id: string): Promise<CategoryGroup | undefined> {
        return database.selectFrom('category_groups').selectAll().where('id', '=', id).executeTakeFirst();
    }

    public async getCategory(id: string): Promise<Category | undefined> {
        return database.selectFrom('categories').selectAll().where('id', '=', id).executeTakeFirst();
    }
}

export const categoriesRepository = new DatabaseCategoriesRepository();
