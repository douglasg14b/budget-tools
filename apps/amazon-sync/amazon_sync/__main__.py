"""Run the service: `python -m amazon_sync`.

The jar comes from S3 when AMAZON_COOKIES_S3_BUCKET is set, otherwise from a file:

    AMAZON_COOKIES_S3_BUCKET             bucket `pnpm amazon:refresh-cookies` uploads to
    AMAZON_COOKIES_S3_ENDPOINT           e.g. https://s3.home.lan
    AMAZON_COOKIES_S3_ACCESS_KEY_ID      service account (read is enough)
    AMAZON_COOKIES_S3_SECRET_ACCESS_KEY
    AMAZON_COOKIES_S3_KEY                default cookies.json
    AMAZON_COOKIES_S3_REGION             default us-east-1
    AMAZON_COOKIES_S3_FORCE_PATH_STYLE   default true

    AMAZON_COOKIE_JAR_PATH               a local jar (read, never written)

    AMAZON_DOMAIN                        default amazon.com
    AMAZON_SYNC_HOST                     default 0.0.0.0 (inside a container); the dev launcher uses 127.0.0.1
    AMAZON_SYNC_PORT                     default 4022
"""

from __future__ import annotations

import logging
import os
import signal
import sys
from pathlib import Path
from typing import Optional

from .amazon import AmazonClient
from .jar_source import FileJarSource, JarSource, S3JarSource, s3_client
from .server import build_server

DEFAULT_S3_KEY = "cookies.json"


def jar_source_from_env() -> Optional[JarSource]:
    bucket = _env("AMAZON_COOKIES_S3_BUCKET")
    if bucket:
        missing = [
            name
            for name in ("AMAZON_COOKIES_S3_ENDPOINT", "AMAZON_COOKIES_S3_ACCESS_KEY_ID", "AMAZON_COOKIES_S3_SECRET_ACCESS_KEY")
            if not _env(name)
        ]
        if missing:
            print(f"AMAZON_COOKIES_S3_BUCKET is set but {', '.join(missing)} is not.", file=sys.stderr)
            return None
        client = s3_client(
            endpoint=_env("AMAZON_COOKIES_S3_ENDPOINT"),
            region=_env("AMAZON_COOKIES_S3_REGION") or "us-east-1",
            access_key_id=_env("AMAZON_COOKIES_S3_ACCESS_KEY_ID"),
            secret_access_key=_env("AMAZON_COOKIES_S3_SECRET_ACCESS_KEY"),
            force_path_style=_env("AMAZON_COOKIES_S3_FORCE_PATH_STYLE").lower() != "false",
        )
        return S3JarSource(client, bucket, _env("AMAZON_COOKIES_S3_KEY") or DEFAULT_S3_KEY)

    jar_path = _env("AMAZON_COOKIE_JAR_PATH")
    if jar_path:
        return FileJarSource(Path(jar_path))

    print(
        "No cookie jar configured. Set AMAZON_COOKIES_S3_* (production) or AMAZON_COOKIE_JAR_PATH (a local file).",
        file=sys.stderr,
    )
    return None


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    source = jar_source_from_env()
    if source is None:
        return 2

    host = os.environ.get("AMAZON_SYNC_HOST", "0.0.0.0")
    port = int(os.environ.get("AMAZON_SYNC_PORT", "4022"))
    client = AmazonClient(source, os.environ.get("AMAZON_DOMAIN", "amazon.com"))
    server = build_server(client, host, port)
    logging.getLogger(__name__).info("amazon-sync listening on http://%s:%d (jar: %s)", host, port, source.describe())
    # `docker stop` sends SIGTERM; turn it into a normal exit so the cleanup below runs.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        # The working copy is a live session; don't leave it in the temp directory.
        client.close()
    return 0


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


if __name__ == "__main__":
    sys.exit(main())
