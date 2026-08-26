export type AmazonSplitLineDto = {
    amount: number;
    categoryId: string;
    categoryName: string;
    categoryGroup: string;
    memo: string | null;
};

export type AmazonSplitItemDto = {
    orderId: string;
    title: string;
    asin: string | null;
    quantity: number;
    amount: number;
    categoryId: string | null;
    categoryName: string | null;
    categoryGroup: string | null;
};

export type AmazonMatchedPaymentDto = {
    id: string;
    paymentDate: string;
    amount: number;
    currency: string;
    cardLast4: string | null;
    vendor: string | null;
    isRefund: boolean;
};

export type AmazonMatchedOrderDto = {
    orderId: string;
    orderDate: string | null;
    total: number | null;
    tax: number | null;
    shipping: number | null;
    promotion: number | null;
};

export type AmazonMatchKindDto = 'payment' | 'batched-orders' | 'partial-order' | 'unmatched';

export type AmazonSplitOverlayDto = {
    transactionId: string;
    dataStatus: 'ready' | 'not-synced';
    match: AmazonMatchKindDto;
    payment: AmazonMatchedPaymentDto | null;
    orders: AmazonMatchedOrderDto[];
    orderIds: string[];
    items: AmazonSplitItemDto[];
    lines: AmazonSplitLineDto[];
    collapsed: boolean;
    rationale: string | null;
    notes: string | null;
};

export type AmazonSuggestRequestDto = {
    transactionId: string;
};
