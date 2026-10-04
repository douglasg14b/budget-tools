"""Jar sources: what a missing, unchanged, or unreachable jar turns into."""

from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path

from botocore.exceptions import ClientError, EndpointConnectionError

from amazon_sync.errors import CookiesMissing, CookieStoreUnavailable
from amazon_sync.jar_source import FileJarSource, S3JarSource


def client_error(status: int, code: str) -> ClientError:
    return ClientError({"Error": {"Code": code}, "ResponseMetadata": {"HTTPStatusCode": status}}, "GetObject")


class FakeS3:
    """Answers get_object from a queue of responses or exceptions, recording each request."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.requests = []

    def get_object(self, **request):
        self.requests.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        body, etag = answer
        return {"Body": io.BytesIO(body), "ETag": etag}


class FileJarSourceTest(unittest.TestCase):
    def test_reads_the_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cookies.json"
            path.write_bytes(b'{"x-main": "synthetic"}')
            self.assertEqual(FileJarSource(path).read(), b'{"x-main": "synthetic"}')

    def test_missing_and_empty_files_are_cookies_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cookies.json"
            with self.assertRaises(CookiesMissing):
                FileJarSource(path).read()
            path.write_bytes(b"  \n")
            with self.assertRaises(CookiesMissing):
                FileJarSource(path).read()


class S3JarSourceTest(unittest.TestCase):
    def test_first_read_fetches_and_later_reads_send_the_etag(self):
        s3 = FakeS3((b"jar-1", '"e1"'), client_error(304, "304"))
        source = S3JarSource(s3, "bucket", "cookies.json")
        self.assertEqual(source.read(), b"jar-1")
        self.assertEqual(source.read(), b"jar-1")
        self.assertNotIn("IfNoneMatch", s3.requests[0])
        self.assertEqual(s3.requests[1]["IfNoneMatch"], '"e1"')

    def test_a_new_upload_replaces_the_cached_copy(self):
        s3 = FakeS3((b"jar-1", '"e1"'), (b"jar-2", '"e2"'))
        source = S3JarSource(s3, "bucket", "cookies.json")
        source.read()
        self.assertEqual(source.read(), b"jar-2")

    def test_no_object_is_cookies_missing_even_with_a_cached_copy(self):
        s3 = FakeS3((b"jar-1", '"e1"'), client_error(404, "NoSuchKey"), client_error(404, "NoSuchKey"))
        source = S3JarSource(s3, "bucket", "cookies.json")
        source.read()
        with self.assertRaises(CookiesMissing):
            source.read()
        # The cache is gone, so the next request is unconditional.
        with self.assertRaises(CookiesMissing):
            source.read()
        self.assertNotIn("IfNoneMatch", s3.requests[2])

    def test_an_empty_object_is_cookies_missing(self):
        source = S3JarSource(FakeS3((b"", '"e0"')), "bucket", "cookies.json")
        with self.assertRaises(CookiesMissing):
            source.read()

    def test_an_unreachable_store_is_not_reported_as_expired_cookies(self):
        source = S3JarSource(FakeS3(EndpointConnectionError(endpoint_url="https://s3.example")), "bucket", "k")
        with self.assertRaises(CookieStoreUnavailable):
            source.read()

    def test_access_denied_without_a_cached_copy_is_store_unavailable(self):
        source = S3JarSource(FakeS3(client_error(403, "AccessDenied")), "bucket", "k")
        with self.assertRaises(CookieStoreUnavailable):
            source.read()

    def test_an_outage_after_a_good_read_keeps_using_the_last_copy(self):
        s3 = FakeS3((b"jar-1", '"e1"'), EndpointConnectionError(endpoint_url="https://s3.example"))
        source = S3JarSource(s3, "bucket", "cookies.json")
        source.read()
        with self.assertLogs("amazon_sync.jar_source", level="WARNING"):
            self.assertEqual(source.read(), b"jar-1")


if __name__ == "__main__":
    unittest.main()
