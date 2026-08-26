export type AmazonPaymentsTable = {
    id: string;
    paymentDate: string;
    amountMilliunits: number;
    currency: string;
    orderIdsJson: string;
    cardLast4: string | null;
    vendor: string | null;
    isRefund: boolean;
    rawJson: string;
};

export type AmazonOrdersTable = {
    orderId: string;
    orderDate: string | null;
    totalMilliunits: number | null;
    shippingMilliunits: number | null;
    taxMilliunits: number | null;
    promotionMilliunits: number | null;
    rawJson: string;
};

export type AmazonOrderItemsTable = {
    id: string;
    orderId: string;
    lineIndex: number;
    asin: string | null;
    title: string;
    quantity: number;
    itemTotalMilliunits: number;
    rawJson: string;
};

export type AmazonSyncStateTable = {
    id: number;
    lastAuthCheck: string | null;
    lastAuthenticated: boolean;
    coveredRangesJson: string;
};
