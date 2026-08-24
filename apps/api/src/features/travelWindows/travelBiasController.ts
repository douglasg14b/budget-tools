import { Body, Get, Patch, Route, Tags } from 'tsoa';

import type { TravelBiasDto } from './travelWindowsDtos';
import { getTravelBias, patchTravelBias } from './travelWindowsStore';

@Route('travel-bias')
@Tags('travel-bias')
export class TravelBiasController {
    /**
     * @summary getTravelBias
     */
    @Get()
    public async getTravelBias(): Promise<TravelBiasDto> {
        return await getTravelBias();
    }

    /**
     * @summary patchTravelBias
     */
    @Patch()
    public async patchTravelBias(@Body() body: TravelBiasDto): Promise<TravelBiasDto> {
        return await patchTravelBias(body.enabled);
    }
}
