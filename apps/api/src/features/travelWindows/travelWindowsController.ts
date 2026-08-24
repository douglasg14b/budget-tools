import { Body, Delete, Get, Path, Post, Put, Response, Route, SuccessResponse, Tags } from 'tsoa';

import type { TravelWindowDto, TravelWindowsDto, TravelWindowWriteDto } from './travelWindowsDtos';
import { createTravelWindow, deleteTravelWindow, listTravelWindows, updateTravelWindow } from './travelWindowsStore';

@Route('travel-windows')
@Tags('travel-windows')
export class TravelWindowsController {
    /**
     * @summary listTravelWindows
     */
    @Get()
    public async listTravelWindows(): Promise<TravelWindowsDto> {
        return { windows: await listTravelWindows() };
    }

    /**
     * @summary createTravelWindow
     */
    @SuccessResponse(201, 'Created')
    @Response(409, 'Overlapping travel window')
    @Post()
    public async createTravelWindow(@Body() body: TravelWindowWriteDto): Promise<TravelWindowDto> {
        return await createTravelWindow(body);
    }

    /**
     * @summary updateTravelWindow
     */
    @Response(409, 'Overlapping travel window')
    @Put('{id}')
    public async updateTravelWindow(@Path() id: string, @Body() body: TravelWindowWriteDto): Promise<TravelWindowDto> {
        return await updateTravelWindow(id, body);
    }

    /**
     * @summary deleteTravelWindow
     */
    @Delete('{id}')
    public async deleteTravelWindow(@Path() id: string): Promise<void> {
        await deleteTravelWindow(id);
    }
}
