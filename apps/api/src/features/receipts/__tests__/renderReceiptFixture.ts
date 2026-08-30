import sharp from 'sharp';

const RECEIPT_WIDTH = 720;
const FONT_SIZE = 32;
const LINE_HEIGHT = 52;
const PAD_X = 48;
const PAD_TOP = 56;
const PAD_BOTTOM = 56;

export type ReceiptMoneyLine = {
    readonly label: string;
    readonly amount: string;
};

export type ReceiptFixtureInput = {
    readonly headingLines: readonly string[];
    readonly moneyLines: readonly ReceiptMoneyLine[];
};

/**
 * Rasterizes a high-contrast receipt SVG to PNG for live vision tests.
 */
export async function renderReceiptPng(input: ReceiptFixtureInput): Promise<Buffer> {
    const svg = receiptSvg(input);
    return sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
}

export async function renderCafeReceiptPng(): Promise<Buffer> {
    return renderReceiptPng({
        headingLines: ['HEARTH & RYE', '2026-08-01'],
        moneyLines: [
            { label: 'Latte', amount: '4.50' },
            { label: 'Muffin', amount: '3.20' },
            { label: 'Tax', amount: '0.62' },
            { label: 'Discount', amount: '0.20' },
            { label: 'Grand Total', amount: '8.12' },
        ],
    });
}

export async function renderAmazonReceiptPng(): Promise<Buffer> {
    return renderReceiptPng({
        headingLines: ['AMAZON.COM', 'AMZN Mktp', '2026-08-15'],
        moneyLines: [
            { label: 'USB Cable', amount: '12.99' },
            { label: 'Tax', amount: '1.17' },
            { label: 'Grand Total', amount: '14.16' },
        ],
    });
}

function receiptSvg(input: ReceiptFixtureInput): string {
    const headingCount = input.headingLines.length;
    const gapAfterHeading = 24;
    const height =
        PAD_TOP + headingCount * LINE_HEIGHT + gapAfterHeading + input.moneyLines.length * LINE_HEIGHT + PAD_BOTTOM;
    const headingNodes = input.headingLines.map((line, index) => {
        const y = PAD_TOP + index * LINE_HEIGHT;
        const weight = index === 0 ? 'bold' : 'normal';
        return (
            `<text x="${RECEIPT_WIDTH / 2}" y="${y}" text-anchor="middle" ` +
            `font-family="Arial, Consolas, sans-serif" font-size="${FONT_SIZE}" font-weight="${weight}" ` +
            `fill="#000000">${escapeXml(line)}</text>`
        );
    });
    const moneyStartY = PAD_TOP + headingCount * LINE_HEIGHT + gapAfterHeading;
    const moneyNodes = input.moneyLines.map((line, index) => {
        const y = moneyStartY + index * LINE_HEIGHT;
        const amountX = RECEIPT_WIDTH - PAD_X;
        return (
            `<text x="${PAD_X}" y="${y}" font-family="Arial, Consolas, sans-serif" font-size="${FONT_SIZE}" ` +
            `fill="#000000">${escapeXml(line.label)}</text>` +
            `<text x="${amountX}" y="${y}" text-anchor="end" font-family="Arial, Consolas, sans-serif" ` +
            `font-size="${FONT_SIZE}" fill="#000000">${escapeXml(line.amount)}</text>`
        );
    });
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${RECEIPT_WIDTH}" height="${height}">`,
        `<rect width="100%" height="100%" fill="#ffffff"/>`,
        `<rect x="12" y="12" width="${RECEIPT_WIDTH - 24}" height="${height - 24}" fill="none" stroke="#000000" stroke-width="2"/>`,
        ...headingNodes,
        ...moneyNodes,
        `</svg>`,
    ].join('');
}

function escapeXml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
