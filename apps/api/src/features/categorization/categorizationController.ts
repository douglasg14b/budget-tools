import type { Request as ExpressRequest } from 'express';
import { Body, Get, Post, Query, Request, Route, Tags } from 'tsoa';

import type { CategorizationQueueDto, LlmSuggestOverlayDto, LlmSuggestRequestDto } from './categorizationDtos';
import { suggestWithLlm } from './llm/suggestWithLlm';
import { loadCategorizationQueue } from './loadCategorizationQueue';

@Route('categorization')
@Tags('categorization')
export class CategorizationController {
    /**
     * Pending review queue with locally scored AI proposals joined to transaction details.
     * @param tier Comma-separated ApprovalTier values to include
     * @param accountId Filter to a single YNAB account id
     * @param refresh Discard cached scores and rescore the newest batch
     * @param expand Score the next never-scored batch; ignored when refresh is true
     */
    @Get('queue')
    public async getCategorizationQueue(
        @Query() tier?: string,
        @Query() accountId?: string,
        @Query() refresh?: boolean,
        @Query() expand?: boolean,
    ): Promise<CategorizationQueueDto> {
        return await loadCategorizationQueue({
            tier,
            accountId,
            refresh,
            expand,
        });
    }

    /**
     * Just-in-time LLM category (and optional payee) overlay for one scored queue transaction.
     * @summary postLlmSuggest
     */
    @Post('llm-suggest')
    public async postLlmSuggest(
        @Body() body: LlmSuggestRequestDto,
        @Request() request: ExpressRequest,
    ): Promise<LlmSuggestOverlayDto> {
        return await suggestWithLlm(body.transactionId, abortSignalFromRequest(request));
    }
}

/**
 * Abort only when the client actually drops the connection.
 * `res.close` also fires for a finished request body, which cancelled in-flight OpenRouter calls.
 */
function abortSignalFromRequest(request: ExpressRequest): AbortSignal {
    const controller = new AbortController();
    request.once('aborted', () => {
        controller.abort();
    });
    return controller.signal;
}
