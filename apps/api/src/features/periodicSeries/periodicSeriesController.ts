import { Get, Response, Route, Tags } from 'tsoa';

import { loadPeriodicSeries } from './loadPeriodicSeries';
import type { PeriodicSeriesListDto } from './periodicSeriesDtos';

@Route('periodic-series')
@Tags('periodic-series')
export class PeriodicSeriesController {
    /**
     * Catalog of repeating series detected from ledger history.
     * @summary listPeriodicSeries
     */
    @Get()
    @Response(503, 'Warm scorer unavailable')
    public async listPeriodicSeries(): Promise<PeriodicSeriesListDto> {
        return await loadPeriodicSeries();
    }
}
