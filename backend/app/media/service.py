import asyncio
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime, timedelta
from functools import partial
import secrets

from pydantic import BaseModel, ConfigDict

from app.media.configuration import MediaSettings
from app.media.enums import MediaLifetimeSeconds, MediaType
from app.media.errors import InvalidImageError, InvalidMediaTypeError, MediaNotFoundError, MediaTooLargeError
from app.media.image_encoding import strip_metadata_and_downscale
from app.media.store import MediaStore, StoredMedia


class UploadedMedia(BaseModel):
    model_config = ConfigDict(frozen=True)

    media_id: str
    extension: str
    delete_token: str
    expires_at: datetime
    lifetime_seconds: int


class PreparedImage(BaseModel):
    model_config = ConfigDict(frozen=True)

    data: bytes
    media_type: MediaType


class MediaService:
    def __init__(self, *, store: MediaStore, settings: MediaSettings, image_process_pool: ProcessPoolExecutor) -> None:
        self.store = store
        self.settings = settings
        self.image_process_pool = image_process_pool

    async def upload_media(
        self, data: bytes, *, content_type: str, lifetime_seconds: MediaLifetimeSeconds
    ) -> UploadedMedia:
        prepared = await self.prepare_image(data, content_type=content_type)
        media_type = prepared.media_type
        media_id = secrets.token_hex(16)
        delete_token = secrets.token_hex(16)
        await self.store.put_media(
            media_id,
            media=StoredMedia(data=prepared.data, media_type=media_type),
            delete_token=delete_token,
            # redis-py encodes ints with repr(), which for an IntEnum member is not a number.
            lifetime_seconds=int(lifetime_seconds),
        )
        return UploadedMedia(
            media_id=media_id,
            extension=media_type.extension,
            delete_token=delete_token,
            expires_at=datetime.now(UTC) + timedelta(seconds=lifetime_seconds),
            lifetime_seconds=lifetime_seconds,
        )

    async def prepare_image(self, data: bytes, *, content_type: str) -> PreparedImage:
        """Size and type check, then metadata strip and downscale. Also used by the bucket relay."""
        if len(data) > self.settings.max_size_bytes:
            raise MediaTooLargeError
        if content_type not in MediaType:
            raise InvalidMediaTypeError
        media_type = MediaType(content_type)
        return PreparedImage(
            data=await self.strip_metadata_and_downscale(data, media_type=media_type), media_type=media_type
        )

    async def strip_metadata_and_downscale(self, data: bytes, *, media_type: MediaType) -> bytes:
        # Pillow is CPU work, so it runs in the process pool; the deadline frees the request even
        # when a pathological file keeps a worker busy.
        encode = partial(
            strip_metadata_and_downscale,
            data,
            media_type=media_type,
            max_dimension_pixels=self.settings.max_dimension_pixels,
        )
        try:
            async with asyncio.timeout(self.settings.image_processing_timeout_seconds):
                return await asyncio.get_running_loop().run_in_executor(self.image_process_pool, encode)
        except TimeoutError as error:
            raise InvalidImageError from error

    async def get_media(self, media_id: str, *, extension: str) -> StoredMedia:
        media = await self.store.find_media(media_id)
        if media is None or media.media_type.extension != extension:
            raise MediaNotFoundError
        return media

    async def delete_media(self, media_id: str, *, delete_token: str) -> None:
        if not await self.store.delete_media_with_token(media_id, delete_token=delete_token):
            raise MediaNotFoundError
