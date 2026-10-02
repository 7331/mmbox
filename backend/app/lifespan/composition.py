from collections.abc import AsyncIterator
from concurrent.futures import ProcessPoolExecutor
from contextlib import AsyncExitStack, asynccontextmanager

from pydantic import BaseModel, ConfigDict

from app.bucket_relay.service import BucketRelayService
from app.config import get_app_settings
from app.lifespan.resources import Resources
from app.media.configuration import get_media_settings
from app.media.service import MediaService
from app.media.store import MediaStore
from app.rate_limits.configuration import get_rate_limits_settings
from app.rate_limits.service import RateLimitService
from app.rate_limits.store import RateLimitStore
from app.redis.client import create_redis_client
from app.s3_api.client import S3ApiClient
from app.s3_api.configuration import get_s3_api_settings
from app.s3_api.lifespan import create_s3_http_client
from app.shared.configuration import get_proxy_settings


def load_all_settings() -> None:
    """Build every settings class at startup, so a missing or malformed key refuses the process."""
    get_app_settings()
    get_proxy_settings()
    get_media_settings()
    get_rate_limits_settings()
    get_s3_api_settings()


@asynccontextmanager
async def open_resources() -> AsyncIterator[Resources]:
    """Open every client on one exit stack, so they close in reverse order even when startup fails halfway."""
    load_all_settings()
    async with AsyncExitStack() as exit_stack:
        redis = create_redis_client(redis_url=get_app_settings().redis_url)
        exit_stack.push_async_callback(redis.aclose)
        await redis.ping()  # fail at startup, not on the first request
        image_process_pool = ProcessPoolExecutor(max_workers=get_media_settings().image_processing_workers)
        exit_stack.callback(image_process_pool.shutdown, cancel_futures=True)
        s3_http_client = create_s3_http_client(settings=get_s3_api_settings())
        exit_stack.push_async_callback(s3_http_client.aclose)
        yield Resources(redis=redis, image_process_pool=image_process_pool, s3_http_client=s3_http_client)


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
