from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

MEBIBYTE = 1024 * 1024


class MediaSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEDIA_", extra="ignore")

    max_size_bytes: int = Field(default=25 * MEBIBYTE, gt=0)
    # Uploads that skip the page's editor (curl, ShareX) are downscaled past this, so one upload
    # cannot take a large share of Redis memory.
    max_dimension_pixels: int = Field(default=4096, gt=0)
    image_processing_timeout_seconds: float = Field(default=15, gt=0)
    image_processing_workers: int = Field(default=2, gt=0)


@lru_cache
def get_media_settings() -> MediaSettings:
    return MediaSettings()
