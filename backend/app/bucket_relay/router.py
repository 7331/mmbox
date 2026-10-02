from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from pydantic import ValidationError

from app.bucket_relay.dependencies import BucketRelayServiceDependency
from app.bucket_relay.schemas import (
    DeleteObjectRequest,
    ListObjectsRequest,
    ObjectListResponse,
    ObjectSummaryResponse,
    RelayUploadResponse,
)
from app.media.configuration import get_media_settings
from app.rate_limits.dependencies import check_fetch_rate_limit, check_upload_rate_limit
from app.s3_api.models import S3Connection
from app.shared.errors import InvalidRequestError

# POST everywhere: the visitor's keys travel in the body, never in a URL that proxies log.
router = APIRouter(prefix="/api/buckets", tags=["buckets"])


@router.post("/check", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(check_fetch_rate_limit)])
async def check_bucket(*, request: ListObjectsRequest, bucket_relay_service: BucketRelayServiceDependency) -> None:
    await bucket_relay_service.check_bucket(request.connection, prefix=request.prefix)


@router.post("/objects", dependencies=[Depends(check_fetch_rate_limit)])
async def list_objects(
    *, request: ListObjectsRequest, bucket_relay_service: BucketRelayServiceDependency
) -> ObjectListResponse:
    listing = await bucket_relay_service.list_objects(
        request.connection, prefix=request.prefix, continuation_token=request.continuation_token
    )
    return ObjectListResponse(
        objects=[ObjectSummaryResponse(**summary.model_dump()) for summary in listing.objects],
        next_continuation_token=listing.next_continuation_token,
    )


@router.post("/upload", dependencies=[Depends(check_upload_rate_limit)])
async def upload_image(
    *,
    file: Annotated[UploadFile, File()],
    connection: Annotated[str, Form()],
    prefix: Annotated[str, Form(max_length=512)] = "",
    bucket_relay_service: BucketRelayServiceDependency,
) -> RelayUploadResponse:
    # Multipart carries the connection as JSON text next to the file.
    try:
        parsed_connection = S3Connection.model_validate_json(connection)
    except ValidationError as error:
        raise InvalidRequestError from error
    data = await file.read(get_media_settings().max_size_bytes + 1)
    key = await bucket_relay_service.upload_image(
        parsed_connection, prefix=prefix, data=data, content_type=file.content_type or ""
    )
    return RelayUploadResponse(key=key)


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(check_fetch_rate_limit)])
async def delete_object(*, request: DeleteObjectRequest, bucket_relay_service: BucketRelayServiceDependency) -> None:
    await bucket_relay_service.delete_object(request.connection, key=request.key)
