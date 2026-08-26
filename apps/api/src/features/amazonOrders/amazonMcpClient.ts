import { existsSync } from 'node:fs';
import process from 'node:process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { AMAZON_ORDERS_SYNC_TIMEOUT_MS, getAmazonOrdersMcpEntry } from '../../environment';
import { HttpError } from '../travelWindows/HttpError';
import type { AmazonOrdersSource } from './amazonOrdersSource';
import type { IsoDateRange } from './isoDate';
import type { ParsedAmazonAuth, ParsedAmazonOrder, ParsedAmazonPayment } from './parseAmazonMcp';
import {
    parseAmazonAuthPayload,
    parseAmazonOrderDetailsPayload,
    parseAmazonTransactionsPayload,
    parseMcpToolJson,
} from './parseAmazonMcp';

type ToolResult = {
    readonly content?: readonly { type: string; text?: string }[];
    readonly isError?: boolean;
};

let connecting: Promise<AmazonOrdersSource> | undefined;

/**
 * Long-lived MCP client. Starts headed Chromium inside the subprocess on first tool call.
 */
export function getAmazonOrdersSource(): Promise<AmazonOrdersSource> {
    if (!connecting) {
        connecting = connectAmazonMcp().catch((error: unknown) => {
            connecting = undefined;
            throw error;
        });
    }
    return connecting;
}

async function connectAmazonMcp(): Promise<AmazonOrdersSource> {
    const entry = getAmazonOrdersMcpEntry();
    if (!entry) {
        throw new HttpError(
            503,
            'AMAZON_ORDERS_MCP_ENTRY is not configured. Clone amazon-order-history-csv-download-mcp, build it, and set the path to dist/index.js.',
        );
    }
    if (!existsSync(entry)) {
        throw new HttpError(503, `Amazon MCP entry was not found at ${entry}`);
    }

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: stringEnv(process.env),
        stderr: 'inherit',
    });
    const client = new Client({ name: 'budget-tools-api', version: '1.0.0' });
    await client.connect(transport);
    return createMcpSource(client);
}

function createMcpSource(client: Client): AmazonOrdersSource {
    return {
        async checkAuth(region: string): Promise<ParsedAmazonAuth> {
            const payload = await callToolJson(client, 'check_amazon_auth_status', { region });
            return parseAmazonAuthPayload(payload);
        },
        async getTransactions(input: { region: string; range: IsoDateRange }): Promise<ParsedAmazonPayment[]> {
            const payload = await callToolJson(client, 'get_amazon_transactions', {
                region: input.region,
                start_date: input.range.start,
                end_date: input.range.end,
            });
            return parseAmazonTransactionsPayload(payload);
        },
        async getOrderDetails(input: { region: string; orderId: string }): Promise<ParsedAmazonOrder> {
            const payload = await callToolJson(client, 'get_amazon_order_details', {
                region: input.region,
                order_id: input.orderId,
                include_shipments: false,
                include_transactions: false,
            });
            return parseAmazonOrderDetailsPayload(payload, input.orderId);
        },
    };
}

async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await client.callTool({ name, arguments: args }, undefined, {
        timeout: AMAZON_ORDERS_SYNC_TIMEOUT_MS,
    })) as ToolResult;
    const text = toolText(result);
    if (result.isError) {
        throw new HttpError(503, `Amazon MCP tool ${name} failed: ${text}`);
    }
    return parseMcpToolJson(text);
}

function toolText(result: ToolResult): string {
    const block = result.content?.find((entry) => entry.type === 'text' && entry.text);
    if (!block?.text) {
        throw new HttpError(503, 'Amazon MCP returned no text content');
    }
    return block.text;
}

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
            next[key] = value;
        }
    }
    return next;
}
