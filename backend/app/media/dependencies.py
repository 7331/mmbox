from typing import Annotated

from fastapi import Depends

from app.lifespan.dependencies import ServicesDependency
from app.media.service import MediaService


def get_media_service(services: ServicesDependency) -> MediaService:
    return services.media


MediaServiceDependency = Annotated[MediaService, Depends(get_media_service)]
