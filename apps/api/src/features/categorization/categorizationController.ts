import type { Request as ExpressRequest } from 'express';
import { Body, Get, Post, Query, Request, Route, Tags } from 'tsoa';

import type { AmazonSplitOverlayDto, AmazonSuggestRequestDto } from '../amazonClassify/amazonClassifyDtos';
import { suggestAmazonSplits } from '../amazonClassify/suggestAmazonSplits';
import type {
    CategorizationPredictDto,
    CategorizationPredictRequestDto,
    CategorizationQueueDto,
    LlmSuggestOverlayDto,
    LlmSuggestRequestDto,
} from './categorizationDtos';
import { suggestWithLlm } from './llm/suggestWithLlm';
import { loadCategorizationQueue } from './loadCategorizationQueue';
import { predictTransactions } from './predictTransactions';

@Route('categorization')
@Tags('categorization')
export class CategorizationController {
    /**
     * Pending review queue joined to cached local ML proposals.
     * Window queries (`around` / `olderThan` / `newerThan`) list pending rows without scoring.
     * @param tier Comma-separated ApprovalTier values to include
     * @param accountId Filter to a single YNAB account id
     * @param q Case-insensitive substring filter over payee, import names, memo, category, account, date, and amount
     * @param refresh Discard cached scores and rescore the newest batch
     * @param expand Score the next never-scored batch; ignored when refresh is true
     * @param around Center a pending window on this transaction id
     * @param olderThan Next older pending batch after this transaction id
     * @param newerThan Next newer pending batch before this transaction id
     */
    @Get('queue')
    public async getCategorizationQueue(
        @Query() tier?: string,
        @Query() accountId?: string,
        @Query() q?: string,
        @Query() refresh?: boolean,
        @Query() expand?: boolean,
        @Query() around?: string,
        @Query() olderThan?: string,
        @Query() newerThan?: string,
    ): Promise<CategorizationQueueDto> {
        return await loadCategorizationQueue({
            tier,
            accountId,
            q,
            refresh,
            expand,
            around,
            olderThan,
            newerThan,
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

    /**
     * Amazon-only split overlay for one scored Amazon queue transaction.
     * @summary postAmazonSuggest
     */
    @Post('amazon-suggest')
    public async postAmazonSuggest(
        @Body() body: AmazonSuggestRequestDto,
        @Request() request: ExpressRequest,
    ): Promise<AmazonSplitOverlayDto> {
        return await suggestAmazonSplits(body.transactionId, abortSignalFromRequest(request));
    }

    /**
     * Score pending transactions with the local ML models and cache the proposals.
     * @summary postPredict
     */
    @Post('predict')
    public async postPredict(@Body() body: CategorizationPredictRequestDto): Promise<CategorizationPredictDto> {
        return await predictTransactions(body);
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
