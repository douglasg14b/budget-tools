"""Log in to Amazon with a headless browser and write a cookie jar: `mint_cookie_jar.py <jar>`.

Run by `pnpm amazon:refresh-cookies` in apps/amazon-sync/.venv-browser, the only venv
with Playwright. Prompts for email, password and the SMS code. Nothing is stored except
the jar itself, written to the path given.

A cold login over plain HTTP always fails: Amazon serves a JavaScript challenge before it
accepts credentials. The library's Playwright forms solve it headlessly and copy the
resulting cookies back into the requests session, which is what lands in the jar. After
that, plain HTTP is enough, which is why the server needs no browser.

Exit codes: 0 jar written, 1 login failed or jar incomplete, 2 wrong environment.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from getpass import getpass
from pathlib import Path
from typing import Any, Optional

# Installing the [browser] extra does NOT register the Playwright forms. The default chain
# is hardcoded and ends in AcicAuthBlocker + JSAuthBlocker, which only raise "install the
# browser extra". Naming the Playwright forms here puts each ahead of its blocker. Both run
# headless.
#
# PlaywrightManualWafForm is left out on purpose: it is for AWS WAF picture puzzles, and
# when tried it opened a visible window on plain amazon.com with nothing to solve.
AUTH_FORMS_CLASSES = [
    "amazonorders.contrib.browser.playwright.PlaywrightJSAuthForm",
    "amazonorders.contrib.browser.playwright.PlaywrightAcicForm",
]

# The cookies that carry the signed-in session. A jar missing any of them is not uploaded.
AUTH_COOKIE_NAMES = {"x-main", "at-main", "sess-at-main", "ubid-main", "session-id"}


class TerminalIO:
    """Sends Amazon's prompts (SMS code, captcha, account picker) to the terminal."""

    def echo(self, msg: str, **kwargs: Any) -> None:
        print(msg)

    def prompt(self, msg: str, type: Optional[Any] = None, **kwargs: Any) -> Any:
        for choice in kwargs.get("choices", []):
            print(choice)
        if kwargs.get("img_url"):
            print(f"[captcha image] {kwargs['img_url']}")
        return input(f"--> {msg}: ")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: mint_cookie_jar.py <cookies.json>", file=sys.stderr)
        return 2
    jar = Path(argv[1]).resolve()

    try:
        import playwright  # noqa: F401
        from amazonorders.conf import AmazonOrdersConfig
        from amazonorders.session import AmazonSession
    except ImportError as error:
        print(f"Wrong venv: {error}. This needs amazon-orders[browser] (apps/amazon-sync/.venv-browser).", file=sys.stderr)
        return 2

    # Keep the library's config and debug pages away from ~/.config/amazonorders; debug pages
    # can hold order details. The caller deletes the jar's directory when done, so put them there.
    workdir = Path(tempfile.mkdtemp(prefix="amazon-login-", dir=jar.parent))
    config = AmazonOrdersConfig(
        config_path=str(workdir / "config.yml"),
        data={
            "cookie_jar_path": str(jar),
            "output_dir": str(workdir / "debug"),
            "auth_forms_classes": AUTH_FORMS_CLASSES,
        },
    )

    domain = os.environ.get("AMAZON_DOMAIN", "amazon.com")

    # The chain is assembled in AmazonSession.__init__, so only a constructed session shows
    # whether the solvers made it in. Check with a throwaway one before asking for anything.
    probe = AmazonSession(io=TerminalIO(), config=config, domain=domain)
    if not any(type(form).__name__.startswith("Playwright") for form in probe.auth_forms):
        print("No Playwright form in the auth chain; the JavaScript challenge would fail.", file=sys.stderr)
        return 2

    print("Amazon login. The password is not echoed and nothing but the cookie jar is saved.")
    try:
        username = input("Amazon email: ").strip()
        password = getpass("Amazon password: ")
    except EOFError:
        print("\nNo terminal to read the login from. Run this in an interactive terminal.", file=sys.stderr)
        return 2
    session = AmazonSession(username, password, io=TerminalIO(), config=config, domain=domain)

    print("Logging in. Solving Amazon's challenge can take ~30 seconds with no output; expect an SMS code prompt.")
    try:
        session.login()
    except Exception as error:  # noqa: BLE001 - any failure means no jar; say why and stop
        print(f"Login failed: {type(error).__name__}: {error}", file=sys.stderr)
        return 1

    if not jar.exists():
        print(f"Login reported success but no cookie jar was written to {jar}.", file=sys.stderr)
        return 1
    names = set(json.loads(jar.read_text(encoding="utf-8")))
    missing = AUTH_COOKIE_NAMES - names
    if missing:
        print(f"The jar is missing session cookies: {', '.join(sorted(missing))}.", file=sys.stderr)
        return 1
    print(f"Logged in. Cookie jar holds {len(names)} cookies.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
