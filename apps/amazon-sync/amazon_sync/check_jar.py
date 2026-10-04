"""Prove a cookie jar works over plain HTTP: `python -m amazon_sync.check_jar <jar>`.

`pnpm amazon:refresh-cookies` runs this on a freshly minted jar before uploading it, so a
bad jar never replaces a good one. It runs the same code the service runs, in the
service's own venv, which must not have Playwright: if a browser could step in, a pass
would say nothing about the browser-free server.

Exit codes: 0 works, 1 Amazon rejected it, 2 misuse. Prints no cookie values.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

from .amazon import AmazonClient
from .errors import AmazonSyncError
from .jar_source import FileJarSource


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m amazon_sync.check_jar <cookies.json>", file=sys.stderr)
        return 2
    if importlib.util.find_spec("playwright") is not None:
        print("Playwright is importable here, so this check would not prove a browser-free session.", file=sys.stderr)
        print("Run it from apps/amazon-sync/.venv, not the browser venv.", file=sys.stderr)
        return 2

    client = AmazonClient(FileJarSource(Path(argv[1])), os.environ.get("AMAZON_DOMAIN", "amazon.com"))
    try:
        client.check_auth()
    except AmazonSyncError as error:
        print(f"The jar does not work over plain HTTP ({error.code}): {error}", file=sys.stderr)
        return 1
    finally:
        client.close()
    print("The jar works over plain HTTP, with no browser.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
