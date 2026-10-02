from app.rate_limits.enums import RateLimitBucket


def rate_limit_key(*, bucket: RateLimitBucket, caller_ip: str) -> str:
    return f"rl:{bucket}:{caller_ip}"
