import { getAmazonOrdersMcpEntry, getAmazonSyncUrl } from '../../environment';
import { getAmazonOrdersSource as getAmazonMcpSource } from './amazonMcpClient';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import { createAmazonSyncSource } from './amazonSyncClient';

/**
 * The amazon-sync service when `AMAZON_SYNC_URL` is set, else the legacy MCP.
 * The MCP stays as a fallback until the service has run for a full cycle.
 */
export async function getAmazonOrdersSource(): Promise<AmazonOrdersSource> {
    const syncUrl = getAmazonSyncUrl();
    return syncUrl ? createAmazonSyncSource(syncUrl) : await getAmazonMcpSource();
}

export function amazonOrdersSourceConfigured(): boolean {
    return Boolean(getAmazonSyncUrl() || getAmazonOrdersMcpEntry());
}

export function describeAmazonOrdersSource(): string {
    const syncUrl = getAmazonSyncUrl();
    if (syncUrl) {
        return `amazon-sync at ${syncUrl}`;
    }
    const entry = getAmazonOrdersMcpEntry();
    return entry ? `MCP entry ${entry}` : 'unset';
}
