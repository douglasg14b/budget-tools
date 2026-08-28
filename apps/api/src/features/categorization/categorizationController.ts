import type { Request as ExpressRequest } from 'express';
import { Body, Delete, Get, Path, Post, Query, Request, Response, Route, SuccessResponse, Tags } from 'tsoa';

import type { AmazonSplitOverlayDto, AmazonSuggestRequestDto } from '../amazonClassify/amazonClassifyDtos';
import { suggestAmazonSplits } from '../amazonClassify/suggestAmazonSplits';
import {
    countClassificationSyncByStatus,
    latestClassificationSyncError,
    oldestPendingCreatedAt,
} from '../ynabSync/data/classificationSyncRepo';
import { flushOutboundSync } from '../ynabSync/flush/flushOutboundSync';
import { recordDecisions } from '../ynabSync/recordDecisions';
import { retractDecision } from '../ynabSync/retractDecision';
import type {
    ClassificationDecisionsRequestDto,
    ClassificationDecisionsResponseDto,
    OutboundSyncFlushDto,
    OutboundSyncStatusDto,
} from '../ynabSync/ynabSyncDtos';
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

    /**
     * Record live classification decisions. Enqueues YNAB writes; does not call YNAB on this request.
     * @summary postClassificationDecisions
     */
    @Post('decisions')
    @Response(403, 'YNAB writes are disabled in practice mode')
    @Response(404, 'Transaction not found')
    @Response(409, 'Decision cannot replace an in-flight or already-pushed row')
    public async postClassificationDecisions(
        @Body() body: ClassificationDecisionsRequestDto,
    ): Promise<ClassificationDecisionsResponseDto> {
        return await recordDecisions(body.decisions);
    }

    /**
     * Retract a pending or failed live decision.
     * @summary deleteClassificationDecision
     */
    @Delete('decisions/{transactionId}')
    @SuccessResponse(204, 'Retracted')
    @Response(403, 'YNAB writes are disabled in practice mode')
    @Response(409, 'Decision has already been flushed')
    public async deleteClassificationDecision(@Path() transactionId: string): Promise<void> {
        await retractDecision(transactionId);
    }

    /**
     * Outbound YNAB sync queue counts.
     * @summary getOutboundSync
     */
    @Get('outbound-sync')
    public async getOutboundSync(): Promise<OutboundSyncStatusDto> {
        const [counts, oldestPendingAt, lastError] = await Promise.all([
            countClassificationSyncByStatus(),
            oldestPendingCreatedAt(),
            latestClassificationSyncError(),
        ]);
        return {
            pendingCount: counts.pending,
            syncingCount: counts.syncing,
            failedCount: counts.failed,
            syncedUnconfirmedCount: counts.synced,
            oldestPendingAt,
            lastError,
        };
    }

    /**
     * Flush pending classification rows to YNAB now, still respecting rate limits.
     * @summary postOutboundSyncFlush
     */
    @Post('outbound-sync/flush')
    @Response(503, 'YNAB credentials missing')
    public async postOutboundSyncFlush(): Promise<OutboundSyncFlushDto> {
        return await flushOutboundSync();
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
