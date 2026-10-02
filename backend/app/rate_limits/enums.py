from enum import StrEnum


class RateLimitBucket(StrEnum):
    UPLOAD = "upload"
    FETCH = "get"
