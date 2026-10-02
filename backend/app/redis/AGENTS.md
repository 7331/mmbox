# redis

`create_redis_client`: one binary-safe RESP3 client over a blocking pool, socket timeouts, retries on connection errors only. A `RedisError` in a request renders as 503 `store_unavailable`.

Redis runs without persistence and with `allkeys-lru`: everything in it may vanish. Each domain's `keys.py` owns its key builders.
