/** The File names for each of the accounts */
export const ACCOUNTS = ['checking'] as const;
export type AccountName = (typeof ACCOUNTS)[number];

/** Map account names from your file names to your YNAB account names */
export const ACCOUNTS_NAME_MAP = {
    checking: '💵 Checking',
} satisfies Record<AccountName, string>;

// Certain transactions may false flag due to complicated mechanisms the script doesn't handle
// Examples:
//  - Multiple charges/refunds of the same charge in the same day
//  - Checks cashed really late
export const BANK_IGNORE_LIST = [
    // Example
    {
        // The matching bank transaction
        date: '2023-1-01',
        amount: -12345,
        matchedYnab: {
            // THe Matching ynab transaction
            date: '2023-10-03',
            amount: -12345,
        },
    },
];
