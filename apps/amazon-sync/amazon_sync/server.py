"""Internal HTTP front for the Amazon client. Not published outside the compose network.

    GET /health                              liveness; never waits on Amazon
    GET /auth                                { authenticated, username, message, loginUrl, code? }
    GET /transactions?start=YYYY-MM-DD&end=  { status, paginationComplete, transactions[] }
    GET /orders/{orderId}                    { status, order, items[] }

Errors are `{ status: "error", code, message }`. COOKIES_MISSING and COOKIES_EXPIRED
both mean the same thing to a human: mint a new jar on the desktop. COOKIE_STORE_UNAVAILABLE
means S3 could not be reached, which says nothing about the jar.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional, Protocol
from urllib.parse import parse_qs, unquote, urlsplit

from . import payloads

logger = logging.getLogger(__name__)


class AmazonSource(Protocol):
    def check_auth(self) -> None: ...

    def transactions(self, start: date, end: date) -> dict[str, Any]: ...

    def order(self, order_id: str) -> dict[str, Any]: ...


def build_server(client: AmazonSource, host: str, port: int) -> ThreadingHTTPServer:
    # Threaded so /health answers during a long sync. AmazonClient holds its own lock,
    # so the Amazon calls themselves still run one at a time.
    handler = type("AmazonSyncHandler", (_Handler,), {"client": client})
    return ThreadingHTTPServer((host, port), handler)


class _Handler(BaseHTTPRequestHandler):
    client: AmazonSource

    def do_GET(self) -> None:  # noqa: N802 - name fixed by BaseHTTPRequestHandler
        url = urlsplit(self.path)
        path = url.path.rstrip("/")
        try:
            if path == "/health":
                self._send(HTTPStatus.OK, {"status": "ok"})
            elif path == "/auth":
                self._auth()
            elif path == "/transactions":
                self._transactions(parse_qs(url.query))
            elif path.startswith("/orders/"):
                self._order(unquote(path.removeprefix("/orders/")))
            else:
                self._send(HTTPStatus.NOT_FOUND, payloads.error_payload("NOT_FOUND", f"No route for {path}"))
        except Exception as error:  # noqa: BLE001 - last resort; the API needs a JSON body
            code = getattr(error, "code", "INTERNAL_ERROR")
            status = getattr(error, "http_status", HTTPStatus.INTERNAL_SERVER_ERROR)
            if status >= 500 and code == "INTERNAL_ERROR":
                logger.exception("Unhandled error on %s", path)
            else:
                logger.warning("%s failed: %s %s", path, code, error)
            self._send(status, payloads.error_payload(code, str(error)))

    def _auth(self) -> None:
        try:
            self.client.check_auth()
        except Exception as error:
            if getattr(error, "code", None) in ("COOKIES_MISSING", "COOKIES_EXPIRED"):
                self._send(
                    HTTPStatus.OK,
                    {
                        "authenticated": False,
                        "username": None,
                        "message": str(error),
                        "loginUrl": None,
                        "code": error.code,  # type: ignore[attr-defined]
                    },
                )
                return
            raise
        self._send(HTTPStatus.OK, {"authenticated": True, "username": None, "message": None, "loginUrl": None})

    def _transactions(self, query: dict[str, list[str]]) -> None:
        start = _iso_date(query, "start")
        end = _iso_date(query, "end")
        if start is None or end is None or start > end:
            self._send(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                payloads.error_payload("BAD_RANGE", "start and end must be ISO dates, with start on or before end"),
            )
            return
        self._send(HTTPStatus.OK, self.client.transactions(start, end))

    def _order(self, order_id: str) -> None:
        order_id = order_id.strip()
        if not order_id or "/" in order_id:
            self._send(HTTPStatus.UNPROCESSABLE_ENTITY, payloads.error_payload("BAD_ORDER_ID", "Missing order id"))
            return
        self._send(HTTPStatus.OK, self.client.order(order_id))

    def _send(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - stdlib signature
        logger.info("%s %s", self.address_string(), format % args)


def _iso_date(query: dict[str, list[str]], name: str) -> Optional[date]:
    values = query.get(name)
    if not values:
        return None
    try:
        return date.fromisoformat(values[0].strip())
    except ValueError:
        return None
