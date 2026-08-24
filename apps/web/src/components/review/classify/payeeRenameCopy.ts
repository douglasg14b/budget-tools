import type { PayeeResolutionMethod } from '@budget-tools/web-sdk';

/** Hover copy for a suggested payee rename, keyed by how the name was resolved. */
export const PAYEE_RENAME_EXPLANATIONS = {
    ExactLookup: 'Previous transactions with this same bank import name used this payee.',
    ClusterLookup: 'Similar bank import names in your history were cleaned to this payee.',
    Model: 'A trained model predicted this payee from the bank import name.',
    Llm: 'The language model suggested this cleaner payee name.',
    Unresolved: 'This payee could not be resolved automatically.',
} as const satisfies Record<PayeeResolutionMethod, string>;
