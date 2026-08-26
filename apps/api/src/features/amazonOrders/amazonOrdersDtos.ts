export type AmazonOrdersDateRangeDto = {
    start: string;
    end: string;
};

export type AmazonOrdersStatusDto = {
    region: string;
    mcpConfigured: boolean;
    lastAuthCheck: string | null;
    lastAuthenticated: boolean;
    coveredRanges: AmazonOrdersDateRangeDto[];
    payments: number;
    orders: number;
    items: number;
};

export type AmazonOrdersSyncRequestDto = {
    from: string;
    to: string;
    region?: string;
};

export type AmazonOrdersSyncDto = {
    region: string;
    from: string;
    to: string;
    scrapedPaymentGaps: AmazonOrdersDateRangeDto[];
    fetchedOrderIds: string[];
    payments: number;
    orders: number;
    items: number;
    coveredRanges: AmazonOrdersDateRangeDto[];
};
