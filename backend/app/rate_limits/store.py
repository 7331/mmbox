from pydantic import BaseModel, ConfigDict
from redis.asyncio import Redis


class WindowCount(BaseModel):
    model_config = ConfigDict(frozen=True)

    hits: int
    remaining_milliseconds: int


class RateLimitStore:
    """Fixed windows: SET NX EX seeds the counter with its TTL before INCR, so a crash can never
    leave a counter without expiry. No persistence: a Redis restart resets every window."""

    def __init__(self, *, redis: Redis) -> None:
        self.redis = redis

    async def count_hit(self, key: str, *, window_seconds: int) -> WindowCount:
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.set(key, 0, ex=window_seconds, nx=True)
            pipeline.incr(key)
            pipeline.pttl(key)
            _, hits, remaining_milliseconds = await pipeline.execute()
        return WindowCount(hits=hits, remaining_milliseconds=remaining_milliseconds)
