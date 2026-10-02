from redis.asyncio import Redis

REDIS_TIMEOUT_SECONDS = 5


def create_redis_client(*, redis_url: str) -> Redis:
    # Connects lazily on the first command. Socket timeouts bound every call, so a stalled Redis
    # surfaces as a RedisError (rendered as 503) instead of a hung request.
    return Redis.from_url(
        redis_url,
        socket_timeout=REDIS_TIMEOUT_SECONDS,
        socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
    )
