import type { AmazonMatchedOrderDto, AmazonSplitItemDto, AmazonSplitOverlayDto } from '@budget-tools/web-sdk';
import { Button, Loader } from '@mantine/core';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { amazonOrderUrl } from './amazonOrderUrl';
import classes from './ClassifyAmazonContext.module.css';
import { formatCategoryLabel } from './formatCategoryLabel';

type ClassifyAmazonContextProps = {
    overlay: AmazonSplitOverlayDto | undefined;
    asking: boolean;
    error: string | null;
    syncing: boolean;
    onSync: () => void;
};

export function ClassifyAmazonContext({ overlay, asking, error, syncing, onSync }: ClassifyAmazonContextProps) {
    const needsSync = overlay?.dataStatus === 'not-synced';
    const groups = overlay ? groupItems(overlay) : [];

    return (
        <div className={classes.panel}>
            <p className={classes.label}>Amazon order</p>
            {asking && !overlay ? (
                <p className={classes.asking}>
                    <Loader size={14} color="gray" />
                    Matching Amazon payment…
                </p>
            ) : null}
            {overlay?.payment ? (
                <p className={classes.payment}>
                    <span>{formatTransactionDate(overlay.payment.paymentDate)}</span>
                    <span className={classes.dot} aria-hidden="true">
                        ·
                    </span>
                    <span>{formatYnabAmount(overlay.payment.amount)}</span>
                    {overlay.payment.cardLast4 ? (
                        <>
                            <span className={classes.dot} aria-hidden="true">
                                ·
                            </span>
                            <span>Card ••••{overlay.payment.cardLast4}</span>
                        </>
                    ) : null}
                    {overlay.payment.vendor ? (
                        <>
                            <span className={classes.dot} aria-hidden="true">
                                ·
                            </span>
                            <span>{overlay.payment.vendor}</span>
                        </>
                    ) : null}
                    {overlay.payment.isRefund ? <span className={classes.refund}>Refund</span> : null}
                </p>
            ) : overlay && overlay.dataStatus !== 'not-synced' ? (
                <p className={classes.match}>{matchLabel(overlay.match)}</p>
            ) : null}
            {groups.map(({ order, items }) => (
                <section className={classes.order} key={order.orderId}>
                    <p className={classes.orderHead}>
                        <a
                            className={classes.orderId}
                            href={amazonOrderUrl(order.orderId)}
                            rel="noreferrer"
                            target="_blank"
                        >
                            {order.orderId}
                        </a>
                        {order.orderDate ? <span>{formatTransactionDate(order.orderDate)}</span> : null}
                        {order.total != null ? <span>{formatYnabAmount(order.total)}</span> : null}
                    </p>
                    {orderMeta(order) ? <p className={classes.orderMeta}>{orderMeta(order)}</p> : null}
                    {items.length > 0 ? (
                        <ul className={classes.items}>
                            {amazonItemKeys(items).map(({ item, key }) => (
                                <li className={classes.item} key={key}>
                                    <div className={classes.itemCopy}>
                                        <span className={classes.title}>
                                            {item.quantity > 1 ? `${item.quantity}× ` : null}
                                            {item.title}
                                        </span>
                                        <span className={classes.category}>
                                            {formatCategoryLabel(item.categoryName, item.categoryGroup) ??
                                                'Uncategorized'}
                                        </span>
                                    </div>
                                    <span className={classes.amount}>{formatYnabAmount(item.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </section>
            ))}
            {overlay?.rationale ? <p className={classes.rationale}>{overlay.rationale}</p> : null}
            {overlay?.notes ? <p className={classes.notes}>{overlay.notes}</p> : null}
            {error ? <p className={classes.error}>{error}</p> : null}
            {needsSync ? (
                <Button className={classes.sync} loading={syncing} size="compact-sm" variant="default" onClick={onSync}>
                    Sync Amazon
                </Button>
            ) : null}
        </div>
    );
}

function groupItems(
    overlay: AmazonSplitOverlayDto,
): Array<{ order: AmazonMatchedOrderDto; items: AmazonSplitItemDto[] }> {
    const byOrder = new Map<string, AmazonSplitItemDto[]>();
    for (const item of overlay.items) {
        const list = byOrder.get(item.orderId) ?? [];
        list.push(item);
        byOrder.set(item.orderId, list);
    }
    if (overlay.orders.length > 0) {
        return overlay.orders.map((order) => ({ order, items: byOrder.get(order.orderId) ?? [] }));
    }
    return [...byOrder.entries()].map(([orderId, items]) => ({
        order: {
            orderId,
            orderDate: null,
            total: null,
            tax: null,
            shipping: null,
            promotion: null,
        },
        items,
    }));
}

function orderMeta(order: AmazonMatchedOrderDto): string | null {
    const parts: string[] = [];
    if (order.tax != null) {
        parts.push(`tax ${formatYnabAmount(order.tax)}`);
    }
    if (order.shipping != null) {
        parts.push(`ship ${formatYnabAmount(order.shipping)}`);
    }
    if (order.promotion != null && order.promotion !== 0) {
        parts.push(`promo ${formatYnabAmount(order.promotion)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
}

function amazonItemKeys(items: readonly AmazonSplitItemDto[]): Array<{ item: AmazonSplitItemDto; key: string }> {
    const seen = new Map<string, number>();
    return items.map((item) => {
        const base = `${item.orderId}:${item.asin ?? ''}:${item.title}:${item.amount}`;
        const occurrence = seen.get(base) ?? 0;
        seen.set(base, occurrence + 1);
        return { item, key: `${base}:${occurrence}` };
    });
}

function matchLabel(kind: AmazonSplitOverlayDto['match']): string {
    switch (kind) {
        case 'payment':
            return 'Matched payment';
        case 'batched-orders':
            return 'Combined orders';
        case 'partial-order':
            return 'Partial shipment';
        case 'unmatched':
            return 'Unmatched';
    }
}
