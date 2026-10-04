"""One cached, cookie-only Amazon session, used by one request at a time.

There are no credentials here. The cookie jar is minted on the desktop, where a headless
browser solves Amazon's JavaScript challenge, and this service only ever reads it. A jar
that stops working is reported as COOKIES_EXPIRED; nothing here can log in.
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import tempfile
import threading
from datetime import date
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

from amazonorders.conf import AmazonOrdersConfig
from amazonorders.exception import AmazonOrdersAuthError, AmazonOrdersError, AmazonOrdersNotFoundError
from amazonorders.orders import AmazonOrders
from amazonorders.session import AmazonSession
from amazonorders.transactions import AmazonTransactions

from . import payloads
from .errors import AmazonSyncError, CookiesExpired, CookiesMissing, CookieStoreUnavailable, OrderNotFound
from .jar_source import JarSource

__all__ = [
    "AmazonClient",
    "AmazonSyncError",
    "CookieStoreUnavailable",
    "CookiesExpired",
    "CookiesMissing",
    "OrderNotFound",
    "lookback_days",
]

logger = logging.getLogger(__name__)

T = TypeVar("T")

# The library filters on `completed_date >= date.today() - days`, using this machine's
# clock and time zone. Ask for a little more and trim to the exact range ourselves, so a
# clock or time zone skew cannot silently drop the first day.
LOOKBACK_PADDING_DAYS = 2


class _NoPromptIO:
    """The library's IODefault, minus the human.

    A prompt means Amazon wants a password or an SMS code, which only the desktop
    refresh can supply. Blocking on stdin would hang the request forever.
    """

    def echo(self, msg: str, **kwargs: Any) -> None:
        logger.info("amazon-orders: %s", msg)

    def prompt(self, msg: str, type: Optional[Any] = None, **kwargs: Any) -> Any:
        raise CookiesExpired(f"Amazon asked for input ({msg!r}); the cookie jar no longer holds a session.")


class _CookieOnlySession(AmazonSession):
    """An AmazonSession that never signs out.

    `check_response()` calls `logout()` whenever a page looks like a sign-in form. The
    stock logout GETs Amazon's sign-out URL, which ends the session for every copy of the
    jar, including the desktop's, and then rewrites the jar without `x-main`. One false
    positive would destroy a good session. Here it only marks this session unusable; the
    caller reports COOKIES_EXPIRED and the source jar is left alone.
    """

    def logout(self) -> None:
        self.is_authenticated = False


class AmazonClient:
    """Owns the session. Every public method holds the lock, so calls never overlap."""

    def __init__(self, jar_source: JarSource, domain: str) -> None:
        self._source = jar_source
        self._domain = domain
        # The library reads and writes `cookie_jar_path` itself, so give it a private
        # copy. The source jar is never written by this service.
        self._workdir = Path(tempfile.mkdtemp(prefix="amazon-sync-"))
        self._lock = threading.Lock()
        self._session: Optional[_CookieOnlySession] = None
        self._session_jar_digest: Optional[str] = None

    def close(self) -> None:
        """Delete the working copy of the jar. The service never calls this; one-shot callers must."""
        with self._lock:
            self._session = None
            shutil.rmtree(self._workdir, ignore_errors=True)

    def check_auth(self) -> None:
        with self._lock:
            session = self._authenticated_session()
            # login() trusts any jar holding `x-main`, so prove it with one real page.
            self._call(lambda: AmazonTransactions(session).get_transactions(days=1, keep_paging=False))

    def transactions(self, start: date, end: date) -> dict[str, Any]:
        with self._lock:
            session = self._authenticated_session()
            days = lookback_days(start, date.today())
            found = self._call(lambda: AmazonTransactions(session).get_transactions(days=days))
            in_range = [t for t in found if start <= t.completed_date <= end]
            reconciled = payloads.reconcile_identical_transactions(
                in_range,
                lambda order_id: self._call(
                    lambda: AmazonTransactions(session).get_transactions(order_id=order_id)
                ),
            )
            return payloads.transactions_payload(reconciled, start, end)

    def order(self, order_id: str) -> dict[str, Any]:
        with self._lock:
            session = self._authenticated_session()
            order = self._call(lambda: AmazonOrders(session).get_order(order_id))
            charged = None
            if payloads.needs_charged_total(order):
                found = self._call(lambda: AmazonTransactions(session).get_transactions(order_id=order_id))
                charged = payloads.charged_total(found)
            return payloads.order_payload(order, order_id, charged)

    def _authenticated_session(self) -> _CookieOnlySession:
        jar = self._source.read()
        digest = hashlib.sha256(jar).hexdigest()
        if self._session and self._session.is_authenticated and digest == self._session_jar_digest:
            return self._session

        # A changed jar means a refresh landed; start over from it.
        self._session = None
        working_jar = self._workdir / "cookies.json"
        working_jar.write_bytes(jar)
        config = AmazonOrdersConfig(
            # Point the config file at the workdir too, so a stray
            # ~/.config/amazonorders/config.yml cannot change behaviour.
            config_path=str(self._workdir / "config.yml"),
            data={"cookie_jar_path": str(working_jar), "output_dir": str(self._workdir / "debug")},
        )
        session = _CookieOnlySession(io=_NoPromptIO(), config=config, domain=self._domain)
        self._call(session.login)
        self._session = session
        self._session_jar_digest = digest
        # Not proof the jar works: login() accepts any jar holding `x-main`. The first real
        # page decides, and a stale jar surfaces there as COOKIES_EXPIRED.
        logger.info("Loaded a new Amazon session from %s", self._source.describe())
        return session

    def _call(self, action: Callable[[], T]) -> T:
        try:
            return action()
        except AmazonSyncError as error:
            if isinstance(error, CookiesExpired):
                self._session = None
            raise
        except AmazonOrdersNotFoundError as error:
            raise OrderNotFound(str(error)) from error
        except AmazonOrdersAuthError as error:
            # Covers AmazonOrdersAuthRedirectError (a rejected jar) and the challenge
            # blockers. Either way a fresh jar from the desktop is the fix.
            self._session = None
            raise CookiesExpired(str(error)) from error
        except AmazonOrdersError as error:
            raise AmazonSyncError(str(error)) from error


def lookback_days(start: date, today: date) -> int:
    """The `days` window that reaches back to `start`, with padding."""
    return max((today - start).days + 1 + LOOKBACK_PADDING_DAYS, 1)
