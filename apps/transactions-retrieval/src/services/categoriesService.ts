import { logInfo } from '@budget-tools/logging';
import type * as ynab from 'ynab';

import type { NewCategory, NewCategoryGroup } from '../data';
import type { CategoriesRepository } from '../repositories';
import { categoriesRepository } from '../repositories';
import type { YnabService } from '../ynab';
import { ynabService } from '../ynab';

interface Dependencies {
    categoriesRepository: CategoriesRepository;
    ynabService: YnabService;
}

export class CategoriesService {
    constructor(private readonly dependencies: Dependencies) {}

    public async processCategories() {
        const { ynabService, categoriesRepository } = this.dependencies;
        const { categoryGroups } = await ynabService.getCategories();

        logInfo(`Got ${categoryGroups.length} category groups from YNAB`);
        logInfo(`Got ${categoryGroups.flatMap((x) => x.categories).length} categories from YNAB`);

        // Process category groups first
        for (const group of categoryGroups) {
            const categoryGroup = this.createCategoryGroupEntity(group);
            await categoriesRepository.upsertCategoryGroup(categoryGroup);

            // Process categories within the group
            for (const category of group.categories) {
                const categoryEntity = this.createCategoryEntity(category);
                await categoriesRepository.upsertCategory(categoryEntity);
            }
        }
    }

    private createCategoryGroupEntity(group: ynab.CategoryGroupWithCategories): NewCategoryGroup {
        return {
            id: group.id,
            name: group.name,
            hidden: group.hidden,
            deleted: group.deleted,
        };
    }

    private createCategoryEntity(category: ynab.Category): NewCategory {
        return {
            id: category.id,
            category_group_id: category.category_group_id,
            name: category.name,
            hidden: category.hidden,
            deleted: category.deleted,
            note: category.note,
        };
    }
}

export const categoriesService = new CategoriesService({
    categoriesRepository,
    ynabService,
});
