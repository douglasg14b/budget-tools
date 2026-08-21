import { Get, Route, Tags } from 'tsoa';

import type { HealthDto } from './healthDtos';

@Route('health')
@Tags('health')
export class HealthController {
    @Get()
    public getHealth(): HealthDto {
        return { ok: true };
    }
}
