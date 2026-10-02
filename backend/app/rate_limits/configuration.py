from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RateLimitsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RATE_LIMITS_", extra="ignore")

    uploads_per_hour: int = Field(default=30, gt=0)
    fetches_per_minute: int = Field(default=120, gt=0)


@lru_cache
def get_rate_limits_settings() -> RateLimitsSettings:
    return RateLimitsSettings()
