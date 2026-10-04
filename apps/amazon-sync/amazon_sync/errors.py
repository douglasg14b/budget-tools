"""Errors the service reports by code. The API maps COOKIES_* to "refresh the jar"."""

from __future__ import annotations


class AmazonSyncError(Exception):
    code = "AMAZON_ERROR"
    http_status = 502


class CookiesMissing(AmazonSyncError):
    code = "COOKIES_MISSING"
    http_status = 503


class CookiesExpired(AmazonSyncError):
    code = "COOKIES_EXPIRED"
    http_status = 503


class CookieStoreUnavailable(AmazonSyncError):
    """The jar could not be fetched, which says nothing about whether it still works.

    Kept apart from COOKIES_* so an S3 outage never tells a human to log in again.
    """

    code = "COOKIE_STORE_UNAVAILABLE"
    http_status = 503


class OrderNotFound(AmazonSyncError):
    code = "ORDER_NOT_FOUND"
    http_status = 404
