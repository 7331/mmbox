from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, SecretStr


class S3Connection(BaseModel):
    """A visitor's bucket. Sent with every request and never stored."""

    model_config = ConfigDict(frozen=True)

    endpoint: HttpUrl
    bucket: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{1,254}$")
    region: str = Field(default="auto", min_length=1, max_length=64)
    access_key_id: str = Field(min_length=1, max_length=256)
    secret_access_key: SecretStr = Field(min_length=1, max_length=256)


class ObjectSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    key: str
    size_bytes: int
    last_modified_at: datetime


class ObjectListing(BaseModel):
    model_config = ConfigDict(frozen=True)

    objects: list[ObjectSummary]
    next_continuation_token: str | None


class S3Request(BaseModel):
    model_config = ConfigDict(frozen=True)

    method: str
    key: str
    body: bytes = b""
    headers: dict[str, str] = Field(default_factory=dict)
    query: dict[str, str] = Field(default_factory=dict)
