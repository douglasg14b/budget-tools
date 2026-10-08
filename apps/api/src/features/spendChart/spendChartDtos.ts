export type SpendChartCategoryDto = {
    categoryId: string;
    categoryName: string;
    groupName: string;
    /** 1 when the category is charted as spent; otherwise each purchase is spread over this many days. */
    windowDays: number;
    /** Net spend dated inside the range, in milliunits, before any smoothing. */
    totalMilliunits: number;
    /** One value per entry in `SpendChartDto.days`, in milliunits, after smoothing. */
    dailyMilliunits: number[];
};

export type SpendChartDto = {
    startDate: string;
    endDate: string;
    /** Every day from `startDate` to `endDate` inclusive, as `YYYY-MM-DD`. */
    days: string[];
    /** Categories with any spend touching the range, largest total first. */
    categories: SpendChartCategoryDto[];
};

export type CategorySmoothingDto = {
    categoryId: string;
    /** 1 turns smoothing off. */
    windowDays: number;
};

export type CategorySmoothingWriteDto = {
    /**
     * @isInt
     * @minimum 1
     * @maximum 365
     */
    windowDays: number;
};
