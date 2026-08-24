import type { ApprovalTier } from '@budget-tools/web-sdk';

/** Hover copy for approval-tier chips and the queue filter bar. */
export const APPROVAL_TIER_EXPLANATIONS = {
    AutoApply: 'Several methods agreed on this category. High confidence — usually safe to accept.',
    Suggested: 'A solid suggestion. Glance at it, then accept if it looks right.',
    Review: 'Signals are weak or conflicting. Pick a category from the alternatives.',
    Blocked: 'Skipped for automatic categorization (excluded payee or check). Assign a category yourself.',
} as const satisfies Record<ApprovalTier, string>;
