from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.s3_api.models import KeyPrefix, ObjectKey, S3Connection


class ListObjectsRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    connection: S3Connection
    prefix: KeyPrefix = ""
    continuation_token: str | None = Field(default=None, max_length=1024)


class DeleteObjectRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    connection: S3Connection
    key: ObjectKey


class ObjectSummaryResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    key: ObjectKey
    size_bytes: int
    last_modified_at: datetime


class ObjectListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    objects: list[ObjectSummaryResponse]
    next_continuation_token: str | None


class RelayUploadResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    key: ObjectKey
