import { Body, Get, Patch, Route, Tags } from 'tsoa';

import { getOperatingMode, setOperatingMode } from './data/operatingModeRepo';
import { parseOperatingMode } from './operatingMode';
import type { OperatingModeDto } from './operatingModeDtos';

@Route('operating-mode')
@Tags('operating-mode')
export class OperatingModeController {
    /**
     * @summary getOperatingMode
     */
    @Get()
    public async getOperatingMode(): Promise<OperatingModeDto> {
        return { mode: await getOperatingMode() };
    }

    /**
     * @summary patchOperatingMode
     */
    @Patch()
    public async patchOperatingMode(@Body() body: OperatingModeDto): Promise<OperatingModeDto> {
        const mode = parseOperatingMode(body.mode);
        await setOperatingMode(mode);
        return { mode };
    }
}
