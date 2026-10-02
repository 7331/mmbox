import secrets
from typing import cast

from pydantic import BaseModel, ConfigDict
from redis.asyncio import Redis

from app.media.enums import MediaType
from app.media.keys import media_key


class StoredMedia(BaseModel):
    model_config = ConfigDict(frozen=True)

    data: bytes
    media_type: MediaType


class MediaStore:
    """One hash per upload at `m:{id}` (data, ctype, token) whose EXPIRE is the chosen lifetime, so
    expiry is exact and needs no sweeper."""

    def __init__(self, *, redis: Redis) -> None:
        self.redis = redis

    async def put_media(self, media_id: str, *, media: StoredMedia, delete_token: str, lifetime_seconds: int) -> None:
        # One transaction: a crash between HSET and EXPIRE would leave a key that never expires.
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.hset(
                media_key(media_id), mapping={"data": media.data, "ctype": media.media_type, "token": delete_token}
            )
            pipeline.expire(media_key(media_id), lifetime_seconds)
            await pipeline.execute()

    async def find_media(self, media_id: str) -> StoredMedia | None:
        data, media_type = await self.redis.hmget(media_key(media_id), ["data", "ctype"])
        if data is None or media_type is None:
            return None
        return StoredMedia(data=data, media_type=MediaType(cast("bytes", media_type).decode()))

    async def delete_media_with_token(self, media_id: str, *, delete_token: str) -> bool:
        """False means gone or not yours; callers must not tell the two apart."""
        stored_token = await self.redis.hget(media_key(media_id), "token")
        if stored_token is None or not secrets.compare_digest(stored_token, delete_token.encode()):
            return False
        await self.redis.delete(media_key(media_id))
        return True
