import type { AmazonItemRecord, AmazonOrderRecord } from '../amazonOrders/data/amazonOrdersRepo';
import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import type { AssignableCategory } from '../categorization/llm/nearbyCategories';
import { alignAmountToBank } from './alignAmountToBank';
import type { AmazonMatchKind } from './matchAmazonPayment';

export function buildAmazonSplitPrompt(input: {
    readonly transaction: TransactionDetailDto;
    readonly match: AmazonMatchKind;
    readonly orderIds: readonly string[];
    readonly items: readonly AmazonItemRecord[];
    readonly orders: readonly AmazonOrderRecord[];
    readonly catalog: readonly AssignableCategory[];
}): { system: string; user: string } {
    const system = [
        "You split one Amazon bank charge into this household's YNAB categories.",
        'Copy categoryName and categoryGroupName from the pick list as separate fields.',
        'categoryName is the category name only — including any emoji. Do not prefix it with the group or join them with a slash.',
        'Never invent a category.',
        'amountMilliunits must be integers and must sum to the bank transaction amount.',
        'Amazon item milliunits below already use the same sign as the bank charge. Copy that sign.',
        'Never emit an opposite-sign line to invent inflows, and never invent items that are not listed.',
        'Item milliunits below are the charged amounts for this bank transaction, net of Subscribe & Save and other discounts.',
        'itemIndex is the 0-based index of the Amazon item this line is for, or null for tax, shipping, or promo leftovers.',
        'memo is a short YNAB memo: 3-8 words, what it is, pack count if useful. No brand, no model number, no size catalog.',
        'Good memo: "16-pack small beach balls". Bad memo: the full Amazon title.',
        'Put leftover tax, shipping, or promotions on their own line or prorate them.',
        'If every item belongs in one category, still return lines — the server will collapse them.',
        'For a partial-order match, allocate only this bank amount, not the full order total.',
    ].join(' ');

    if (input.items.length === 0) {
        throw new Error('Amazon split prompt requires at least one line item');
    }

    const lines: string[] = [];
    const tx = input.transaction;
    lines.push('Bank transaction:');
    lines.push(`- Date: ${tx.date}`);
    lines.push(`- Amount milliunits: ${tx.amount}`);
    lines.push(`- Payee: ${tx.payeeName?.trim() || '(none)'}`);
    lines.push(`- Import original: ${tx.importPayeeNameOriginal?.trim() || '(none)'}`);
    lines.push(`- YNAB transaction ID: ${tx.id}`);
    lines.push(`- Match: ${input.match}`);
    lines.push(`- Order IDs: ${input.orderIds.join(', ') || '(none)'}`);
    lines.push('Amazon items:');
    for (const [index, item] of input.items.entries()) {
        lines.push(
            `- [${index}] ${item.title} | ASIN ${item.asin ?? '(none)'} | qty ${item.quantity} | milliunits ${alignAmountToBank(item.itemTotalMilliunits, tx.amount)}`,
        );
    }
    if (input.orders.length > 0) {
        lines.push('Order totals:');
        for (const order of input.orders) {
            lines.push(
                `- ${order.orderId} total=${signed(order.totalMilliunits, tx.amount)} tax=${signed(order.taxMilliunits, tx.amount)} shipping=${signed(order.shippingMilliunits, tx.amount)} promo=${signed(order.promotionMilliunits, tx.amount)}`,
            );
        }
    }
    lines.push('Pick list:');
    for (const category of input.catalog) {
        lines.push(
            `- categoryGroupName=${JSON.stringify(category.groupName)} categoryName=${JSON.stringify(category.name)}`,
        );
    }

    return { system, user: lines.join('\n') };
}

function signed(amount: number | null, bankAmount: number): string {
    if (amount == null) {
        return 'n/a';
    }
    return String(alignAmountToBank(amount, bankAmount));
}
