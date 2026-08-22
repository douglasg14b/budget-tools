import { Get, Query, Route, Tags } from 'tsoa';

import type { CategorizationQueueDto } from './categorizationDtos';
import { loadCategorizationQueue } from './loadCategorizationQueue';

@Route('categorization')
@Tags('categorization')
export class CategorizationController {
    /**
     * Pending review queue with AI proposals joined to local transaction details.
     * @param tier Comma-separated ApprovalTier values to include
     * @param accountId Filter to a single YNAB account id
     * @param llm Enable LLM fallback for this predict run (cache key)
     * @param refresh Force a new predict-json spawn
     */
    @Get('queue')
    public async getCategorizationQueue(
        @Query() tier?: string,
        @Query() accountId?: string,
        @Query() llm?: boolean,
        @Query() refresh?: boolean,
    ): Promise<CategorizationQueueDto> {
        return await loadCategorizationQueue({
            tier,
            accountId,
            llm,
            refresh,
        });
    }
}
