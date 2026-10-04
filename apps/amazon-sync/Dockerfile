# amazon-sync: Amazon order history over plain HTTP, for the API to call internally.
#
# No browser, deliberately. Amazon's JavaScript challenge only fires on a cold login, and
# that login happens on the desktop, where a headless Chromium solves it and saves the
# session as a cookie jar. A warm jar carries a requests-only session, so this image needs
# amazon-orders without its [browser] extra: no Chromium, no Playwright, no Xvfb,
# no shm_size. Verified 2026-10-03 on python:3.12-slim with a desktop-minted jar
# (docs/plans/amazon-orders-library-migration.md, Verification log row 4).
#
# The jar is read at run time, never baked into a layer: it is a live Amazon session.
# Production reads it from S3 (AMAZON_COOKIES_S3_*), where `pnpm amazon:refresh-cookies`
# uploads it, and picks up a new upload on the next call without a restart. See
# docs/amazon-cookie-refresh.md. For a local test, mount a jar instead:
#
#   docker build -t amazon-sync apps/amazon-sync
#   docker run --rm -p 4022:4022 -v "<dir with cookies.json>:/jar:ro" \
#     -e AMAZON_COOKIE_JAR_PATH=/jar/cookies.json amazon-sync
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY amazon_sync ./amazon_sync

ENV PYTHONUNBUFFERED=1 \
    AMAZON_SYNC_PORT=4022
EXPOSE 4022

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4022/health', timeout=4)"]

CMD ["python", "-m", "amazon_sync"]
