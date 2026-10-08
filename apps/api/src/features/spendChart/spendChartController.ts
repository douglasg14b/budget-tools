import { Body, Get, Path, Put, Query, Route, Tags } from 'tsoa';

import type { CategorySmoothingDto, CategorySmoothingWriteDto, SpendChartDto } from './spendChartDtos';
import { buildSpendChart, setCategorySmoothing } from './spendChartStore';

@Route('spend-chart')
@Tags('spend-chart')
export class SpendChartController {
    /**
     * Daily spend per category, with smoothed categories spread over their window.
     *
     * @summary getSpendChart
     * @param start First day, `YYYY-MM-DD`.
     * @param end Last day, `YYYY-MM-DD`, inclusive.
     */
    @Get()
    public async getSpendChart(@Query() start: string, @Query() end: string): Promise<SpendChartDto> {
        return await buildSpendChart(start, end);
    }

    /**
     * Sets how many days each purchase in a category is spread over. 1 turns smoothing off.
     *
     * @summary putCategorySmoothing
     */
    @Put('smoothing/{categoryId}')
    public async putCategorySmoothing(
        @Path() categoryId: string,
        @Body() body: CategorySmoothingWriteDto,
    ): Promise<CategorySmoothingDto> {
        return await setCategorySmoothing(categoryId, body.windowDays);
    }
}
