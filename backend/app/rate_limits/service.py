from app.rate_limits.configuration import RateLimitsSettings
from app.rate_limits.enums import RateLimitBucket
from app.rate_limits.errors import RateLimitedError
from app.rate_limits.keys import rate_limit_key
from app.rate_limits.store import RateLimitStore


class RateLimitService:
    def __init__(self, *, store: RateLimitStore, settings: RateLimitsSettings) -> None:
        self.store = store
        self.settings = settings

    async def check_upload(self, *, caller_ip: str) -> None:
        await self.check(
            bucket=RateLimitBucket.UPLOAD,
            caller_ip=caller_ip,
            limit=self.settings.uploads_per_hour,
            window_seconds=3600,
        )

    async def check_fetch(self, *, caller_ip: str) -> None:
        await self.check(
            bucket=RateLimitBucket.FETCH,
            caller_ip=caller_ip,
            limit=self.settings.fetches_per_minute,
            window_seconds=60,
        )

    async def check(self, *, bucket: RateLimitBucket, caller_ip: str, limit: int, window_seconds: int) -> None:
        window = await self.store.count_hit(
            rate_limit_key(bucket=bucket, caller_ip=caller_ip), window_seconds=window_seconds
        )
        if window.hits > limit:
            raise RateLimitedError(retry_after_seconds=max(window.remaining_milliseconds // 1000, 1))
