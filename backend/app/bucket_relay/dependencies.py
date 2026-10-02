from typing import Annotated

from fastapi import Depends

from app.bucket_relay.service import BucketRelayService
from app.lifespan.dependencies import ServicesDependency


def get_bucket_relay_service(services: ServicesDependency) -> BucketRelayService:
    return services.bucket_relay


BucketRelayServiceDependency = Annotated[BucketRelayService, Depends(get_bucket_relay_service)]
