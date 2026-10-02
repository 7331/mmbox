from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    """What no package owns: the Redis DSN."""

    model_config = SettingsConfigDict(extra="ignore")

    redis_url: str = Field(alias="REDIS_URL", repr=False)


@lru_cache
def get_app_settings() -> AppSettings:
    return AppSettings()
