"""Payload mapping against synthetic fixtures.

Each fixture pins a fact the 2026 spike established against live data, without
copying any of it: never paste real orders, titles, ASINs or card digits in here.
"""

from __future__ import annotations

import unittest
from datetime import date
from types import SimpleNamespace

from amazon_sync import payloads


def transaction(**overrides):
    fields = dict(
        completed_date=date(2026, 3, 10),
        grand_total=-20.00,
        order_number="111-0000000-0000001",
        payment_method_last_4="0042",
        seller="AMZN Mktp US",
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


def item(**overrides):
    fields = dict(title="Test widget", asin="B000TEST01", price=5.00, quantity=None)
    fields.update(overrides)
    return SimpleNamespace(**fields)


def order(**overrides):
    fields = dict(
        order_number="111-0000000-0000001",
        order_placed_date=date(2026, 3, 8),
        grand_total=21.63,
        subtotal=22.77,
        shipping_total=0.0,
        estimated_tax=0.0,
        subscription_discount=None,
        coupon_savings=None,
        promotion_applied=None,
        items=[item()],
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


class TransactionsTest(unittest.TestCase):
    def test_purchase_amount_stays_negative(self):
        # Pinned so nobody "fixes" the sign: the API parser reads amount > 0 as a refund.
        row = payloads.transaction_row(transaction(grand_total=-47.64))
        self.assertEqual(row["amount"], -47.64)

    def test_refund_amount_stays_positive(self):
        self.assertEqual(payloads.transaction_row(transaction(grand_total=12.5))["amount"], 12.5)

    def test_maps_fields_the_parser_reads(self):
        row = payloads.transaction_row(transaction())
        self.assertEqual(
            row,
            {
                "date": "2026-03-10",
                "amount": -20.00,
                "orderIds": ["111-0000000-0000001"],
                "cardInfo": "0042",
                "vendor": "AMZN Mktp US",
            },
        )

    def test_digital_charge_takes_its_order_id_from_the_order_link(self):
        # The library leaves order_number blank for digital orders but keeps the link.
        row = payloads.transaction_row(
            transaction(
                order_number="",
                seller="Amazon Kids+",
                order_details_link="https://www.amazon.com/gp/css/order-details?orderID=D01-0000000-0000005",
            )
        )
        self.assertEqual(row["orderIds"], ["D01-0000000-0000005"])

    def test_charge_with_no_order_and_no_link_has_no_order_ids(self):
        self.assertEqual(payloads.transaction_row(transaction(order_number=""))["orderIds"], [])
        self.assertEqual(
            payloads.transaction_row(transaction(order_number=None, order_details_link=None))["orderIds"], []
        )

    def test_a_parsed_order_number_wins_over_the_link(self):
        row = payloads.transaction_row(
            transaction(order_details_link="https://www.amazon.com/gp/css/order-details?orderID=D01-0000000-0000005")
        )
        self.assertEqual(row["orderIds"], ["111-0000000-0000001"])

    def test_trims_to_the_requested_range_inclusive(self):
        rows = [
            transaction(completed_date=date(2026, 2, 28)),
            transaction(completed_date=date(2026, 3, 1)),
            transaction(completed_date=date(2026, 3, 31)),
            transaction(completed_date=date(2026, 4, 1)),
        ]
        payload = payloads.transactions_payload(rows, date(2026, 3, 1), date(2026, 3, 31))
        self.assertEqual([r["date"] for r in payload["transactions"]], ["2026-03-01", "2026-03-31"])
        self.assertTrue(payload["paginationComplete"])
        self.assertEqual(payload["status"], "success")


class IdenticalTransactionsTest(unittest.TestCase):
    def reconcile(self, rows, per_order):
        asked = []

        def order_transactions(order_id):
            asked.append(order_id)
            return per_order.get(order_id, [])

        return payloads.reconcile_identical_transactions(rows, order_transactions), asked

    def test_listing_duplicate_is_dropped_when_the_order_has_one(self):
        refund = transaction(grand_total=31.98, order_number="112-0000000-0000002")
        kept, asked = self.reconcile([refund, transaction(grand_total=31.98, order_number="112-0000000-0000002")],
                                     {"112-0000000-0000002": [refund]})
        self.assertEqual(len(kept), 1)
        self.assertEqual(asked, ["112-0000000-0000002"])

    def test_two_real_identical_charges_are_both_kept(self):
        charge = dict(grand_total=-15.85, order_number="114-0000000-0000003")
        other = transaction(grand_total=-18.93, order_number="114-0000000-0000003")
        per_order = {"114-0000000-0000003": [transaction(**charge), other, transaction(**charge)]}
        kept, _ = self.reconcile([transaction(**charge), other, transaction(**charge)], per_order)
        self.assertEqual([t.grand_total for t in kept], [-15.85, -18.93, -15.85])

    def test_unique_rows_never_ask_amazon(self):
        kept, asked = self.reconcile([transaction(), transaction(grand_total=-1.0)], {})
        self.assertEqual(len(kept), 2)
        self.assertEqual(asked, [])

    def test_identical_digital_charges_pass_through(self):
        kids = dict(grand_total=-5.99, order_number="", seller="Amazon Kids+")
        kept, asked = self.reconcile([transaction(**kids), transaction(**kids)], {})
        self.assertEqual(len(kept), 2)
        self.assertEqual(asked, [])

    def test_keeps_the_rows_if_the_order_list_comes_back_empty(self):
        row = dict(grand_total=-9.0, order_number="111-0000000-0000004")
        kept, _ = self.reconcile([transaction(**row), transaction(**row)], {})
        self.assertEqual(len(kept), 2)


class ItemsTest(unittest.TestCase):
    def test_single_item_quantity_none_means_one(self):
        row = payloads.item_row(item(price=7.59, quantity=None))
        self.assertEqual(row["quantity"], 1)
        self.assertEqual(row["itemTotal"], 7.59)

    def test_price_is_a_unit_price(self):
        row = payloads.item_row(item(price=7.59, quantity=3))
        self.assertEqual(row["unitPrice"], 7.59)
        self.assertEqual(row["itemTotal"], 22.77)

    def test_missing_price_omits_both_price_keys(self):
        row = payloads.item_row(item(price=None))
        self.assertNotIn("unitPrice", row)
        self.assertNotIn("itemTotal", row)


class OrderTest(unittest.TestCase):
    def test_reports_the_grand_total_when_amazon_has_one(self):
        payload = payloads.order_payload(order(grand_total=21.63), "111-0000000-0000001", charged_total=99.0)
        self.assertEqual(payload["order"]["total"], 21.63)

    def test_zero_grand_total_falls_back_to_charged_total(self):
        broken = order(grand_total=0.0)
        self.assertTrue(payloads.needs_charged_total(broken))
        payload = payloads.order_payload(broken, broken.order_number, charged_total=136.17)
        self.assertEqual(payload["order"]["total"], 136.17)

    def test_no_charges_means_null_total_not_zero(self):
        # 0 would read as a failed scrape and be fetched again on every sync.
        payload = payloads.order_payload(order(grand_total=0.0), "111-0000000-0000001", charged_total=None)
        self.assertIsNone(payload["order"]["total"])

    def test_discounts_are_reported_as_a_positive_magnitude(self):
        payload = payloads.order_payload(
            order(subscription_discount=-1.0, coupon_savings=-0.5, promotion_applied=-1.14),
            "111-0000000-0000001",
            charged_total=None,
        )
        self.assertEqual(payload["order"]["promotion"], 2.64)

    def test_no_discounts_means_null_promotion(self):
        payload = payloads.order_payload(order(), "111-0000000-0000001", charged_total=None)
        self.assertIsNone(payload["order"]["promotion"])

    def test_maps_order_fields(self):
        payload = payloads.order_payload(
            order(shipping_total=4.99, estimated_tax=1.25, items=[item(), item(title="Second", asin=None)]),
            "111-0000000-0000001",
            charged_total=None,
        )
        self.assertEqual(payload["order"]["id"], "111-0000000-0000001")
        self.assertEqual(payload["order"]["date"], "2026-03-08")
        self.assertEqual(payload["order"]["shipping"], 4.99)
        self.assertEqual(payload["order"]["tax"], 1.25)
        self.assertEqual(payload["order"]["subtotal"], 22.77)
        self.assertEqual(len(payload["items"]), 2)

    def test_falls_back_to_the_requested_id(self):
        payload = payloads.order_payload(order(order_number=None), "111-0000000-0000009", charged_total=None)
        self.assertEqual(payload["order"]["id"], "111-0000000-0000009")


class ChargedTotalTest(unittest.TestCase):
    def test_split_shipments_sum_to_the_order_total(self):
        charges = [transaction(grand_total=-86.15), transaction(grand_total=-33.99)]
        self.assertEqual(payloads.charged_total(charges), 120.14)

    def test_refunds_do_not_shrink_the_total(self):
        charges = [transaction(grand_total=-50.00), transaction(grand_total=10.00)]
        self.assertEqual(payloads.charged_total(charges), 50.00)

    def test_no_purchase_transactions_is_none(self):
        self.assertIsNone(payloads.charged_total([]))
        self.assertIsNone(payloads.charged_total([transaction(grand_total=10.00)]))


if __name__ == "__main__":
    unittest.main()
