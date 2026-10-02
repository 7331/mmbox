import secrets

from app.media.service import MediaService
from app.s3_api.client import S3ApiClient
from app.s3_api.models import ObjectListing, S3Connection

TEST_OBJECT_NAME = "media-relay-test"


class BucketRelayService:
    """Talks to a visitor's bucket for them when the bucket does not allow this site's origin
    (no CORS). Images only: they are stripped like any upload, and video through Cloudflare's
    proxy is reserved for its paid services."""

    def __init__(self, *, s3_client: S3ApiClient, media_service: MediaService) -> None:
        self.s3_client = s3_client
        self.media_service = media_service

    async def check_bucket(self, connection: S3Connection, *, prefix: str) -> None:
        key = join_key(prefix=prefix, name=TEST_OBJECT_NAME)
        await self.s3_client.put_object(connection, key=key, data=b"", content_type="text/plain")
        await self.s3_client.delete_object(connection, key=key)

    async def upload_image(self, connection: S3Connection, *, prefix: str, data: bytes, content_type: str) -> str:
        prepared = await self.media_service.prepare_image(data, content_type=content_type)
        key = join_key(prefix=prefix, name=f"{secrets.token_hex(8)}.{prepared.media_type.extension}")
        await self.s3_client.put_object(connection, key=key, data=prepared.data, content_type=prepared.media_type)
        return key

    async def list_objects(
        self, connection: S3Connection, *, prefix: str, continuation_token: str | None
    ) -> ObjectListing:
        listing_prefix = f"{prefix}/" if prefix else ""
        return await self.s3_client.list_objects(
            connection, prefix=listing_prefix, continuation_token=continuation_token
        )

    async def delete_object(self, connection: S3Connection, *, key: str) -> None:
        await self.s3_client.delete_object(connection, key=key)


def join_key(*, prefix: str, name: str) -> str:
    cleaned = prefix.strip("/")
    return f"{cleaned}/{name}" if cleaned else name
