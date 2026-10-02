from pydantic import BaseModel, ConfigDict

from app.bucket_relay.service import BucketRelayService
from app.lifespan.resources import Resources
from app.media.configuration import get_media_settings
from app.media.service import MediaService
from app.media.store import MediaStore
from app.rate_limits.configuration import get_rate_limits_settings
from app.rate_limits.service import RateLimitService
from app.rate_limits.store import RateLimitStore
from app.s3_api.client import S3ApiClient
from app.s3_api.configuration import get_s3_api_settings


class Services(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    media: MediaService
    bucket_relay: BucketRelayService
    rate_limits: RateLimitService


def build_services(resources: Resources) -> Services:
    media_service = MediaService(
        store=MediaStore(redis=resources.redis),
        settings=get_media_settings(),
        image_process_pool=resources.image_process_pool,
    )
    return Services(
        media=media_service,
        bucket_relay=BucketRelayService(
            s3_client=S3ApiClient(http_client=resources.s3_http_client, settings=get_s3_api_settings()),
            media_service=media_service,
        ),
        rate_limits=RateLimitService(store=RateLimitStore(redis=resources.redis), settings=get_rate_limits_settings()),
    )
