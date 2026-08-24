import type { CategorizationRouteReason, ProposalGapReason } from '@budget-tools/web-sdk';

import { humanizeEnum } from './humanizeEnum';

export function formatProposalReasons(
    gapReason: ProposalGapReason,
    routeReason: CategorizationRouteReason,
): string | null {
    const parts: string[] = [];
    if (gapReason !== 'None') {
        parts.push(humanizeEnum(gapReason));
    }
    if (routeReason !== 'None') {
        parts.push(humanizeEnum(routeReason));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}
