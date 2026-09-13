import { CATEGORIZATION_PREDICT_TIMEOUT_MS, getCategorizationScorerUrl } from '../../environment';
import { HttpError } from '../travelWindows/HttpError';
import { hydratePeriodicSeries } from './hydratePeriodicSeries';
import { parsePeriodicSeriesEnvelope } from './parsePeriodicSeries';
import type { PeriodicSeriesListDto } from './periodicSeriesDtos';

/**
 * Lists every repeating series from the warm scorer, with ledger rows attached.
 */
export async function loadPeriodicSeries(): Promise<PeriodicSeriesListDto> {
    const scorerUrl = getCategorizationScorerUrl();
    if (!scorerUrl) {
        throw new HttpError(
            503,
            'CATEGORIZATION_SCORER_URL is not set; start the warm scorer to list repeating series.',
        );
    }

    const parsed = parsePeriodicSeriesEnvelope(await fetchPeriodicSeriesJson(scorerUrl));
    return hydratePeriodicSeries(parsed.series);
}

async function fetchPeriodicSeriesJson(baseUrl: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CATEGORIZATION_PREDICT_TIMEOUT_MS);

    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/periodic-series`, {
            method: 'GET',
            signal: controller.signal,
        });

        const bodyText = await response.text();
        if (!response.ok) {
            const detail = bodyText.trim();
            throw new HttpError(
                503,
                `warm scorer GET /periodic-series failed (${response.status})${detail ? `: ${detail}` : ''}`,
            );
        }

        try {
            return JSON.parse(bodyText) as unknown;
        } catch {
            throw new HttpError(503, 'warm scorer GET /periodic-series response was not valid JSON');
        }
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new HttpError(503, `warm scorer timed out after ${CATEGORIZATION_PREDICT_TIMEOUT_MS}ms`);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpError(503, `warm scorer GET /periodic-series failed: ${message}`);
    } finally {
        clearTimeout(timer);
    }
}
