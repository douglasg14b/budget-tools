"""HTTP routing and error mapping, against a fake client. No Amazon, no network beyond loopback."""

from __future__ import annotations

import json
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date

from amazon_sync.amazon import CookiesExpired, CookiesMissing, CookieStoreUnavailable, OrderNotFound, lookback_days
from amazon_sync.server import build_server


class FakeClient:
    def __init__(self):
        self.auth_error = None
        self.order_error = None
        self.transaction_calls = []

    def check_auth(self):
        if self.auth_error:
            raise self.auth_error

    def transactions(self, start, end):
        self.transaction_calls.append((start, end))
        return {"status": "success", "paginationComplete": True, "transactions": []}

    def order(self, order_id):
        if self.order_error:
            raise self.order_error
        return {"status": "success", "order": {"id": order_id}, "items": []}


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()
        self.server = build_server(self.client, "127.0.0.1", 0)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def get(self, path):
        try:
            with urllib.request.urlopen(self.base + path) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_health(self):
        self.assertEqual(self.get("/health"), (200, {"status": "ok"}))

    def test_auth_ok(self):
        status, body = self.get("/auth")
        self.assertEqual(status, 200)
        self.assertTrue(body["authenticated"])

    def test_expired_jar_is_an_unauthenticated_answer_not_an_error(self):
        self.client.auth_error = CookiesExpired("Amazon redirected to login.")
        status, body = self.get("/auth")
        self.assertEqual(status, 200)
        self.assertFalse(body["authenticated"])
        self.assertEqual(body["code"], "COOKIES_EXPIRED")

    def test_missing_jar_is_reported_by_code(self):
        self.client.auth_error = CookiesMissing("No Amazon cookie jar at /x.")
        self.assertEqual(self.get("/auth")[1]["code"], "COOKIES_MISSING")

    def test_an_unreachable_jar_store_is_an_error_not_a_signed_out_answer(self):
        self.client.auth_error = CookieStoreUnavailable("Could not fetch the jar.")
        status, body = self.get("/auth")
        self.assertEqual(status, 503)
        self.assertEqual(body["code"], "COOKIE_STORE_UNAVAILABLE")

    def test_transactions_parses_the_range(self):
        status, _ = self.get("/transactions?start=2026-03-01&end=2026-03-31")
        self.assertEqual(status, 200)
        self.assertEqual(self.client.transaction_calls, [(date(2026, 3, 1), date(2026, 3, 31))])

    def test_transactions_rejects_a_bad_range(self):
        self.assertEqual(self.get("/transactions?start=2026-03-31&end=2026-03-01")[0], 422)
        self.assertEqual(self.get("/transactions?start=nope&end=2026-03-01")[0], 422)
        self.assertEqual(self.get("/transactions")[0], 422)

    def test_order(self):
        status, body = self.get("/orders/111-0000000-0000001")
        self.assertEqual(status, 200)
        self.assertEqual(body["order"]["id"], "111-0000000-0000001")

    def test_expired_jar_on_a_data_call_is_a_503_with_a_code(self):
        self.client.order_error = CookiesExpired("Amazon redirected to login.")
        status, body = self.get("/orders/111-0000000-0000001")
        self.assertEqual(status, 503)
        self.assertEqual(body, {"status": "error", "code": "COOKIES_EXPIRED", "message": "Amazon redirected to login."})

    def test_unknown_order_is_a_404(self):
        self.client.order_error = OrderNotFound("not found")
        self.assertEqual(self.get("/orders/111-0000000-0000001")[0], 404)

    def test_unexpected_errors_still_return_json(self):
        self.client.order_error = RuntimeError("boom")
        status, body = self.get("/orders/111-0000000-0000001")
        self.assertEqual(status, 500)
        self.assertEqual(body["code"], "INTERNAL_ERROR")


class LookbackTest(unittest.TestCase):
    def test_reaches_past_the_start_date(self):
        # Library keeps completed_date >= today - days; padding absorbs clock skew.
        self.assertGreaterEqual(lookback_days(date(2026, 3, 1), date(2026, 3, 31)), 31)

    def test_never_below_one(self):
        self.assertEqual(lookback_days(date(2026, 4, 30), date(2026, 3, 31)), 1)


if __name__ == "__main__":
    unittest.main()
