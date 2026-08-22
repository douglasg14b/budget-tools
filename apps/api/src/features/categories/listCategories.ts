import { getDatabase } from '../../data/database';
import type { CategoriesDto, CategoryDto, CategoryGroupDto } from './categoriesDtos';

/**
 * Loads non-deleted category groups with nested non-deleted categories.
 */
export async function listCategories(): Promise<CategoriesDto> {
    const database = getDatabase();

    const groups = await database
        .selectFrom('category_groups')
        .select(['id', 'name', 'hidden'])
        .where('deleted', '=', false)
        .orderBy('name', 'asc')
        .execute();

    const categories = await database
        .selectFrom('categories')
        .select(['id', 'category_group_id', 'name', 'hidden', 'note'])
        .where('deleted', '=', false)
        .orderBy('name', 'asc')
        .execute();

    const categoriesByGroupId = new Map<string, CategoryDto[]>();
    for (const category of categories) {
        const groupCategories = categoriesByGroupId.get(category.category_group_id) ?? [];
        groupCategories.push({
            id: category.id,
            name: category.name,
            hidden: category.hidden,
            note: category.note,
        });
        categoriesByGroupId.set(category.category_group_id, groupCategories);
    }

    const nestedGroups: CategoryGroupDto[] = groups.map((group) => ({
        id: group.id,
        name: group.name,
        hidden: group.hidden,
        categories: categoriesByGroupId.get(group.id) ?? [],
    }));

    return { groups: nestedGroups };
}
