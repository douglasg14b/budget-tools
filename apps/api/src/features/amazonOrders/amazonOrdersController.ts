import { Body, Get, Post, Route, Tags } from 'tsoa';

import { getAmazonOrdersSource } from './amazonMcpClient';
import type { AmazonOrdersStatusDto, AmazonOrdersSyncDto, AmazonOrdersSyncRequestDto } from './amazonOrdersDtos';
import { getAmazonOrdersStatus as loadAmazonOrdersStatus } from './getAmazonOrdersStatus';
import { oldestUncategorizedAmazonDate } from './oldestUncategorizedAmazonDate';
import { syncAmazonOrders } from './syncAmazonOrders';

@Route('amazon-orders')
@Tags('amazon-orders')
export class AmazonOrdersController {
    /**
     * Auth and durable cache status. Does not start Playwright.
     * @summary getAmazonOrdersStatus
     */
    @Get('status')
    public async getAmazonOrdersStatus(): Promise<AmazonOrdersStatusDto> {
        return await loadAmazonOrdersStatus();
    }

    /**
     * Index Amazon payments from the oldest uncategorized Amazon charge through today,
     * then fetch invoices for order IDs in the requested classify window. Starts the MCP subprocess if needed.
     * @summary postAmazonOrdersSync
     */
    @Post('sync')
    public async postAmazonOrdersSync(@Body() body: AmazonOrdersSyncRequestDto): Promise<AmazonOrdersSyncDto> {
        return await syncAmazonOrders(
            { ...body, oldestUncategorizedDate: await oldestUncategorizedAmazonDate() },
            await getAmazonOrdersSource(),
        );
    }
}
