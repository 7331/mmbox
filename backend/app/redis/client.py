from redis.asyncio import BlockingConnectionPool, Redis
from redis.asyncio.retry import Retry
from redis.backoff import ExponentialBackoff
from redis.exceptions import ConnectionError as RedisConnectionError

REDIS_TIMEOUT_SECONDS = 5.0
REDIS_MAX_CONNECTIONS = 50


def create_redis_client(*, redis_url: str) -> Redis:
    """One binary-safe client over a blocking pool: past the cap a command waits for a connection
    instead of failing at once. Socket timeouts bound every call, so a stalled Redis is a 503, not a hang.
    """
    connection_pool = BlockingConnectionPool.from_url(
        redis_url,
        max_connections=REDIS_MAX_CONNECTIONS,
        timeout=2.0,
        socket_timeout=REDIS_TIMEOUT_SECONDS,
        socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
        socket_keepalive=True,
        health_check_interval=30,
        # Only connection blips are retried: a timed-out command may have run, and re-sending it
        # (INCR, HSET) would count or write twice.
        retry=Retry(ExponentialBackoff(base=0.05, cap=1.0), 3, supported_errors=(RedisConnectionError,)),
        decode_responses=False,
        protocol=3,
        client_name="mmbox",
    )
    # from_pool hands the pool to the client, so aclose releases its connections.
    return Redis.from_pool(connection_pool)
