from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class S3ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="S3_API_", extra="ignore")

    timeout_seconds: float = Field(default=30, gt=0)
    max_listing_bytes: int = Field(default=2 * 1024 * 1024, gt=0)


@lru_cache
def get_s3_api_settings() -> S3ApiSettings:
    return S3ApiSettings()
