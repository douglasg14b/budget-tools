import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { AccountName } from './constants';

export interface SourceTransactionEntry {
    date: string;
    transaction: 'DEBIT' | 'CREDIT' | number;
    name: string;
    amount: number;
}

export function loadAccountTransactions(account: AccountName): SourceTransactionEntry[] {
    const csv = readFileSync(`data/${account}.csv`, 'utf-8');
    const parsed = parse(csv, {
        columns: true,
        skip_empty_lines: true,
    }) as SourceTransactionEntry[];

    return parsed.map((entry) => {
        entry.amount = Math.round(Number(entry.amount) * 1000);
        return entry;
    });
}
