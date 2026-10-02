from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    redis_url: str = Field(alias="REDIS_URL", repr=False)
    # Set only behind a proxy that overwrites it (CF-Connecting-IP behind Cloudflare).
    trusted_client_ip_header: str | None = Field(default=None, alias="TRUSTED_CLIENT_IP_HEADER")


@lru_cache
def get_app_settings() -> AppSettings:
    return AppSettings()
