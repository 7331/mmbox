from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, Path, Response, UploadFile

from app.media.configuration import get_media_settings
from app.media.dependencies import MediaServiceDependency
from app.media.enums import MediaLifetimeSeconds
from app.media.schemas import HEX_128_BIT_PATTERN, DeleteResponse, UploadResponse
from app.rate_limits.dependencies import check_fetch_rate_limit, check_upload_rate_limit

# A malformed id or token fails validation (400) before Redis is touched.
MediaIdPath = Annotated[str, Path(pattern=HEX_128_BIT_PATTERN)]

router = APIRouter(tags=["media"])


@router.post("/api/upload", dependencies=[Depends(check_upload_rate_limit)])
async def upload_media(
    *,
    file: Annotated[UploadFile, File()],
    media_service: MediaServiceDependency,
    ttl: Annotated[MediaLifetimeSeconds, Form()] = MediaLifetimeSeconds.ONE_DAY,
) -> UploadResponse:
    # One byte past the cap is enough for the service to see the file is too large.
    data = await file.read(get_media_settings().max_size_bytes + 1)
    uploaded = await media_service.upload_media(data, content_type=file.content_type or "", lifetime_seconds=ttl)
    return UploadResponse(
        url=f"/{uploaded.media_id}.{uploaded.extension}",
        id=uploaded.media_id,
        expires_at=uploaded.expires_at,
        ttl=uploaded.lifetime_seconds,
        delete_token=uploaded.delete_token,
    )


@router.delete("/api/media/{media_id}", dependencies=[Depends(check_fetch_rate_limit)])
async def delete_media(
    *,
    media_id: MediaIdPath,
    media_service: MediaServiceDependency,
    delete_token: Annotated[str, Header(alias="X-Delete-Token", pattern=HEX_128_BIT_PATTERN)],
) -> DeleteResponse:
    await media_service.delete_media(media_id, delete_token=delete_token)
    return DeleteResponse(status="deleted", id=media_id)


@router.get("/{media_id}.{extension}", include_in_schema=False, dependencies=[Depends(check_fetch_rate_limit)])
async def get_media(*, media_id: MediaIdPath, extension: str, media_service: MediaServiceDependency) -> Response:
    media = await media_service.get_media(media_id, extension=extension)
    # Cloudflare caches image extensions by default; a cached copy would outlive delete and expiry.
    return Response(content=media.data, media_type=media.media_type, headers={"Cache-Control": "no-store"})
