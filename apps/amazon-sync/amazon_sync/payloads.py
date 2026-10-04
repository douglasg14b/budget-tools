"""Map amazon-orders entities onto the JSON the API already parses.

The API's parser (`apps/api/src/features/amazonOrders/parseAmazonMcp.ts`) was written
for the old Playwright MCP. Emitting the same shapes keeps that parse layer unchanged,
so these functions are the whole contract between the two runtimes.

They read plain attributes rather than library types, so tests can drive them with
synthetic `SimpleNamespace` fixtures: no network, and no real order data.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Callable, Iterable, Optional
from urllib.parse import parse_qs, urlsplit


def reconcile_identical_transactions(
    transactions: list[Any], order_transactions: Callable[[str], list[Any]]
) -> list[Any]:
    """Keep identical rows only as often as Amazon's per-order list has them.

    The full history can list one transaction twice: seen 2026-10-03, a single refund
    appeared twice although the order's own list held it once. It can also hold two
    genuinely identical charges (two equal shipments on one day), and nothing on the
    rows tells the cases apart. The per-order list (`transactionTag`, scoped on Amazon's
    side) is the authority, so for each group of identical rows that names an order,
    keep as many as it does. Digital charges have no order to ask, so they pass through.
    """
    groups: dict[tuple, list[Any]] = {}
    for transaction in transactions:
        groups.setdefault(_transaction_key(transaction), []).append(transaction)

    allowed: dict[tuple, int] = {}
    for key, group in groups.items():
        order_number = key[2]
        if len(group) == 1 or not order_number:
            allowed[key] = len(group)
            continue
        confirmed = sum(1 for t in order_transactions(order_number) if _transaction_key(t) == key)
        # If the per-order list has none (it should always have at least one), keep the
        # rows rather than drop a charge on the strength of a missing answer.
        allowed[key] = confirmed or len(group)

    kept: list[Any] = []
    for transaction in transactions:  # keep Amazon's order
        key = _transaction_key(transaction)
        if allowed[key] > 0:
            allowed[key] -= 1
            kept.append(transaction)
    return kept


def transaction_order_number(transaction: Any) -> str:
    """The order a transaction belongs to, including digital orders.

    The library leaves `order_number` blank for digital charges (Kindle, Audible,
    Kids+: `D01-…`, `P01-…`), but the row still links to the order, and that order's
    details page works like any other. The legacy MCP stored these ids too, so using
    the link keeps payment ids identical across the two sources.
    """
    order_number = (transaction.order_number or "").strip()
    if order_number:
        return order_number
    link = getattr(transaction, "order_details_link", None) or ""
    values = parse_qs(urlsplit(link).query).get("orderID") or []
    return values[0].strip() if values else ""


def _transaction_key(transaction: Any) -> tuple:
    return (
        transaction.completed_date,
        transaction.grand_total,
        transaction_order_number(transaction),
        transaction.payment_method_last_4,
    )


def transactions_payload(transactions: Iterable[Any], start: date, end: date) -> dict[str, Any]:
    rows = [transaction_row(t) for t in transactions if start <= t.completed_date <= end]
    # amazon-orders pages until Amazon runs out of pages or raises, so a returned list is
    # complete for the window. isoDate.ts then treats the whole requested range as covered.
    return {"status": "success", "paginationComplete": True, "transactions": rows}


def transaction_row(transaction: Any) -> dict[str, Any]:
    order_number = transaction_order_number(transaction)
    return {
        "date": transaction.completed_date.isoformat(),
        # Passed through unchanged. Purchases are negative in the library and in the
        # parser (`isRefund: amountMilliunits > 0`), so there is no sign to fix.
        "amount": transaction.grand_total,
        "orderIds": [order_number] if order_number else [],
        "cardInfo": transaction.payment_method_last_4,
        "vendor": transaction.seller,
    }


def order_payload(order: Any, requested_order_id: str, charged_total: Optional[float]) -> dict[str, Any]:
    placed = order.order_placed_date
    return {
        "status": "success",
        "order": {
            "id": order.order_number or requested_order_id,
            "date": placed.isoformat() if placed else None,
            "total": order.grand_total if order.grand_total else charged_total,
            "shipping": order.shipping_total,
            "tax": order.estimated_tax,
            "promotion": promotion_total(order),
            # Amazon's "Item(s) Subtotal": what the items must add up to. The API's
            # completeness check compares against this rather than the taxed total.
            "subtotal": order.subtotal,
        },
        "items": [item_row(item) for item in order.items],
    }


def needs_charged_total(order: Any) -> bool:
    """Amazon sometimes reports a real order's grand total as $0 (or not at all)."""
    return not order.grand_total


def charged_total(order_transactions: Iterable[Any]) -> Optional[float]:
    """What Amazon actually charged for an order: the sum of its purchase transactions.

    This is the only fallback for a missing grand total. Rebuilding it from subtotal,
    tax and discounts was rejected: it missed on 17 of 128 orders that do report a
    total, so it is a guess. Refunds are left out, or a partial refund would shrink the
    total below the item sum. No charges means `None`, never 0: the API reads 0 as a
    failed scrape and fetches the order again.
    """
    charges = [-t.grand_total for t in order_transactions if t.grand_total is not None and t.grand_total < 0]
    return round(sum(charges), 2) if charges else None


def promotion_total(order: Any) -> Optional[float]:
    # The library reports discounts as negative numbers; the MCP sent the magnitude
    # (`{ amount: 7.05, formatted: '-$7.05' }`), and the splitter expects it positive.
    parts = [order.subscription_discount, order.coupon_savings, order.promotion_applied]
    present = [abs(part) for part in parts if part]
    return round(sum(present), 2) if present else None


def item_row(item: Any) -> dict[str, Any]:
    # `quantity` is None for single items; `price` is a unit price
    # (sum of price x quantity == subtotal on every order checked).
    quantity = item.quantity or 1
    row: dict[str, Any] = {"title": item.title, "asin": item.asin, "quantity": quantity}
    if item.price is not None:
        row["unitPrice"] = item.price
        row["itemTotal"] = round(item.price * quantity, 2)
    return row


def error_payload(code: str, message: str) -> dict[str, Any]:
    return {"status": "error", "code": code, "message": message}
