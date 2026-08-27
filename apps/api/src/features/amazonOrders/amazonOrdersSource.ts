import type { IsoDateRange } from './isoDate';
import type { ParsedAmazonAuth, ParsedAmazonOrder, ParsedAmazonTransactions } from './parseAmazonMcp';

export type AmazonOrdersSource = {
    checkAuth(region: string): Promise<ParsedAmazonAuth>;
    getTransactions(input: { region: string; range: IsoDateRange }): Promise<ParsedAmazonTransactions>;
    getOrderDetails(input: { region: string; orderId: string }): Promise<ParsedAmazonOrder>;
};
