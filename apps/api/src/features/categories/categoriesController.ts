import { Get, Route, Tags } from 'tsoa';

import type { CategoriesDto } from './categoriesDtos';
import { listCategories } from './listCategories';

@Route('categories')
@Tags('categories')
export class CategoriesController {
    @Get()
    public async getCategories(): Promise<CategoriesDto> {
        return await listCategories();
    }
}
