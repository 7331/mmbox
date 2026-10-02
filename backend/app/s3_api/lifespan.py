import httpx

from app.s3_api.configuration import S3ApiSettings


def create_s3_http_client(*, settings: S3ApiSettings) -> httpx.AsyncClient:
    # No base_url: every visitor brings their own endpoint. Redirects stay off so a bucket cannot
    # bounce the relay to an address the public-address check never saw.
    return httpx.AsyncClient(timeout=httpx.Timeout(settings.timeout_seconds), follow_redirects=False)
