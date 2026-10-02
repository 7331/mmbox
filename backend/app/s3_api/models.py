from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, HttpUrl, SecretStr

# S3 caps a key at 1024 bytes of UTF-8, not characters, so max_length alone would let a long non-ASCII key through.
S3_KEY_MAX_BYTES = 1024


def require_s3_key_length(value: str) -> str:
    if len(value.encode()) > S3_KEY_MAX_BYTES:
        message = f"longer than {S3_KEY_MAX_BYTES} bytes"
        raise ValueError(message)
    return value


ObjectKey = Annotated[str, Field(min_length=1), AfterValidator(require_s3_key_length)]
KeyPrefix = Annotated[str, AfterValidator(require_s3_key_length)]


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

    key: ObjectKey
    size_bytes: int
    last_modified_at: datetime


class ObjectListing(BaseModel):
    model_config = ConfigDict(frozen=True)

    objects: list[ObjectSummary]
    next_continuation_token: str | None


class S3Request(BaseModel):
    model_config = ConfigDict(frozen=True)

    method: str
    # Empty for bucket-level calls (list).
    key: KeyPrefix
    body: bytes = b""
    headers: dict[str, str] = Field(default_factory=dict)
    query: dict[str, str] = Field(default_factory=dict)
