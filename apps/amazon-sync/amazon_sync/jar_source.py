"""Where the service reads the cookie jar from. Both sources are read-only.

Production reads the object `pnpm amazon:refresh-cookies` uploads to S3. A local file
is for development and for checking a jar before it is uploaded.

Nothing here writes the jar back. The library rewrites its own working copy as it goes,
but uploading that would race the desktop refresh: a sync that started before a refresh
could overwrite the fresh jar with the old session.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional, Protocol

from .errors import CookiesMissing, CookieStoreUnavailable

logger = logging.getLogger(__name__)


class JarSource(Protocol):
    def read(self) -> bytes: ...

    def describe(self) -> str: ...


class FileJarSource:
    def __init__(self, path: Path) -> None:
        self._path = path

    def describe(self) -> str:
        return str(self._path)

    def read(self) -> bytes:
        try:
            jar = self._path.read_bytes()
        except FileNotFoundError:
            raise CookiesMissing(f"No Amazon cookie jar at {self._path}.") from None
        if not jar.strip():
            raise CookiesMissing(f"The Amazon cookie jar at {self._path} is empty.")
        return jar


class S3JarSource:
    """Fetches the jar on every call, sending the last ETag so an unchanged jar costs a 304.

    If S3 cannot be reached after a jar has been fetched once, the last copy is used and a
    warning is logged: a store outage should not stop a sync while the session still works.
    """

    def __init__(self, client: Any, bucket: str, key: str) -> None:
        self._client = client
        self._bucket = bucket
        self._key = key
        self._cached: Optional[bytes] = None
        self._etag: Optional[str] = None

    def describe(self) -> str:
        return f"s3://{self._bucket}/{self._key}"

    def read(self) -> bytes:
        from botocore.exceptions import BotoCoreError, ClientError

        request: dict[str, Any] = {"Bucket": self._bucket, "Key": self._key}
        if self._cached is not None and self._etag:
            request["IfNoneMatch"] = self._etag
        try:
            response = self._client.get_object(**request)
            jar = response["Body"].read()
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = error.response.get("Error", {}).get("Code")
            if status == 304 and self._cached is not None:
                return self._cached
            if status == 404 or code in ("NoSuchKey", "NotFound"):
                # Deleted on purpose, or never uploaded. Don't keep serving an old copy.
                self._cached = None
                self._etag = None
                raise CookiesMissing(f"No Amazon cookie jar at {self.describe()}.") from None
            return self._fallback(f"{code or status}: {error}")
        except BotoCoreError as error:
            return self._fallback(str(error))

        if not jar.strip():
            raise CookiesMissing(f"The Amazon cookie jar at {self.describe()} is empty.")
        self._cached = jar
        self._etag = response.get("ETag")
        return jar

    def _fallback(self, reason: str) -> bytes:
        if self._cached is not None:
            logger.warning("Could not fetch %s (%s); using the last copy.", self.describe(), reason)
            return self._cached
        raise CookieStoreUnavailable(f"Could not fetch the Amazon cookie jar from {self.describe()}: {reason}")


def s3_client(endpoint: str, region: str, access_key_id: str, secret_access_key: str, force_path_style: bool) -> Any:
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(
            s3={"addressing_style": "path" if force_path_style else "auto"},
            connect_timeout=5,
            read_timeout=15,
            retries={"max_attempts": 3, "mode": "standard"},
            # Only check response checksums when the server sends them; S3-compatible
            # stores (rust-fs here) don't all implement the newer default.
            response_checksum_validation="when_required",
        ),
    )
