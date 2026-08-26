import type { IsoDateRange } from './isoDate';
import type { ParsedAmazonAuth, ParsedAmazonOrder, ParsedAmazonPayment } from './parseAmazonMcp';

export type AmazonOrdersSource = {
    checkAuth(region: string): Promise<ParsedAmazonAuth>;
    getTransactions(input: { region: string; range: IsoDateRange }): Promise<ParsedAmazonPayment[]>;
    getOrderDetails(input: { region: string; orderId: string }): Promise<ParsedAmazonOrder>;
};
