import {
    CATEGORIZATION_QUEUE_CACHE_DIR,
    getOpenRouterApiKey,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
} from '../../../environment';
import { listCategories } from '../../categories/listCategories';
import { overlayFingerprint } from '../../travelWindows/travelWindowsSignature';
import { loadTravelWindowsSignature } from '../../travelWindows/travelWindowsStore';
import type { LlmSuggestOverlayDto } from '../categorizationDtos';
import { listSimilarFinalizedTransactions } from '../listSimilarFinalizedTransactions';
import { applyLlmPayee } from './applyLlmPayee';
import { buildLlmPrompt } from './buildLlmPrompt';
import { getScoredQueueItem } from './getScoredQueueItem';
import { LlmSuggestError } from './LlmSuggestError';
import { logLlmSuggest } from './logLlmSuggest';
import { assignableCategories, buildNearbyCategories, resolveAssignableCategory } from './nearbyCategories';
import { completeLlmPrediction } from './openRouterClient';
import { overlayCachePath, readLlmOverlay, writeLlmOverlay } from './overlayCache';

const OPENROUTER_TIMEOUT_MS = 15_000;

/**
 * Just-in-time LLM overlay for one scored queue transaction.
 */
export async function suggestWithLlm(transactionId: string, signal?: AbortSignal): Promise<LlmSuggestOverlayDto> {
    const trimmedId = transactionId.trim();
    if (!trimmedId) {
        throw new LlmSuggestError(422, 'transactionId is required');
    }

    const scored = await getScoredQueueItem(trimmedId);
    const travelSignature = await loadTravelWindowsSignature();
    const overlayKey = overlayFingerprint(scored.fingerprint, travelSignature);
    const cached = await readLlmOverlay(CATEGORIZATION_QUEUE_CACHE_DIR, scored.transaction.id, overlayKey);
    if (cached) {
        logLlmSuggest('cache hit, skipping OpenRouter', {
            cachePath: overlayCachePath(CATEGORIZATION_QUEUE_CACHE_DIR),
            fingerprint: overlayKey,
            overlay: cached,
            transactionId: scored.transaction.id,
        });
        return cached;
    }

    logLlmSuggest('cache miss', {
        fingerprint: overlayKey,
        transactionId: scored.transaction.id,
    });

    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
        throw new LlmSuggestError(503, 'OPENROUTER_API_KEY is not configured');
    }

    const [catalogDto, similar] = await Promise.all([
        listCategories(),
        listSimilarFinalizedTransactions({
            id: scored.transaction.id,
            payeeId: scored.transaction.payeeId,
            payeeName: scored.transaction.payeeName,
            importPayeeNameOriginal: scored.transaction.importPayeeNameOriginal,
            accountId: scored.transaction.accountId,
            amount: scored.transaction.amount,
        }),
    ]);

    const catalog = assignableCategories(catalogDto.groups);
    if (catalog.length === 0) {
        throw new LlmSuggestError(503, 'No assignable categories are available for LLM suggestion');
    }

    const tx = scored.transaction;
    const proposal = scored.proposal;
    logLlmSuggest('current transaction', {
        accountName: tx.accountName,
        amount: tx.amount,
        date: tx.date,
        importPayeeName: tx.importPayeeName,
        importPayeeNameOriginal: tx.importPayeeNameOriginal,
        memo: tx.memo,
        payeeId: tx.payeeId,
        payeeName: tx.payeeName,
        transactionId: tx.id,
    });
    logLlmSuggest('local proposal', {
        confidence: proposal.confidence,
        flags: proposal.flags,
        gapReason: proposal.gapReason,
        method: proposal.method,
        options: proposal.options.map((option) => ({
            category: option.category,
            categoryGroup: option.categoryGroup,
            confidence: option.confidence,
            rank: option.rank,
        })),
        periodicCategory: proposal.periodicMatch?.category ?? null,
        routeReason: proposal.routeReason,
        suggestedCategory: proposal.suggestedCategory,
        suggestedCategoryGroup: proposal.suggestedCategoryGroup,
        transactionId: tx.id,
    });

    const nearby = buildNearbyCategories({
        catalog,
        similar,
        options: proposal.options,
        periodicCategory: proposal.periodicMatch?.category ?? null,
        travelWindow: proposal.travelWindow,
    });
    logLlmSuggest('nearby categories', {
        likely: nearby.likely.map((category) => ({
            name: category.name,
            group: category.groupName,
            why: category.why,
        })),
        pickListCount: nearby.pickList.length,
        pickListHead: nearby.pickList.slice(0, 12).map((category) => `${category.name} | ${category.groupName}`),
        pickListIncludesGroceries: nearby.pickList.some(
            (category) => category.name.trim().toLowerCase() === 'groceries',
        ),
        siblings: nearby.siblings.map((category) => `${category.name} | ${category.groupName}`),
        transactionId: tx.id,
    });

    const prompt = buildLlmPrompt({
        transaction: tx,
        proposal,
        similar,
        nearby,
    });
    logLlmSuggest('prompt size', {
        systemChars: prompt.system.length,
        transactionId: tx.id,
        userChars: prompt.user.length,
        userLines: prompt.user.split('\n').length,
    });

    const prediction = await completeLlmPrediction({
        apiKey,
        baseUrl: OPENROUTER_BASE_URL,
        model: OPENROUTER_MODEL,
        system: prompt.system,
        user: prompt.user,
        timeoutMs: OPENROUTER_TIMEOUT_MS,
        signal,
    });

    const resolved = prediction.categoryName
        ? resolveAssignableCategory(catalog, prediction.categoryName, prediction.categoryGroupName)
        : null;
    logLlmSuggest('category resolve', {
        predictedCategoryGroupName: prediction.categoryGroupName,
        predictedCategoryName: prediction.categoryName,
        predictedConfidence: prediction.confidence,
        predictedPayeeName: prediction.payeeName,
        predictedRationale: prediction.rationale,
        resolved: resolved ? { id: resolved.id, name: resolved.name, groupName: resolved.groupName } : null,
        transactionId: tx.id,
    });

    const overlay: LlmSuggestOverlayDto = {
        transactionId: scored.transaction.id,
        model: OPENROUTER_MODEL,
        suggestedCategory: resolved?.name ?? null,
        suggestedCategoryGroup: resolved?.groupName ?? null,
        suggestedCategoryId: resolved?.id ?? null,
        confidence: resolved ? prediction.confidence : 0,
        notes: prediction.rationale,
        payeeSuggestion: applyLlmPayee({
            transaction: scored.transaction,
            localSuggestion: scored.proposal.payeeSuggestion,
            llmPayeeName: prediction.payeeName,
            confidence: prediction.confidence,
        }),
    };

    await writeLlmOverlay(CATEGORIZATION_QUEUE_CACHE_DIR, overlayKey, overlay);
    logLlmSuggest('overlay written', {
        cachePath: overlayCachePath(CATEGORIZATION_QUEUE_CACHE_DIR),
        overlay,
        transactionId: overlay.transactionId,
    });
    return overlay;
}
