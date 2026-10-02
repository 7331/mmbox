from collections.abc import AsyncIterator
from concurrent.futures import ProcessPoolExecutor
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from pydantic import BaseModel, ConfigDict
from redis.asyncio import Redis

from app.config import get_app_settings
from app.media.configuration import get_media_settings
from app.redis.client import create_redis_client
from app.s3_api.configuration import get_s3_api_settings
from app.s3_api.lifespan import create_s3_http_client


class Resources(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    redis: Redis
    image_process_pool: ProcessPoolExecutor
    s3_http_client: httpx.AsyncClient


@asynccontextmanager
async def open_resources() -> AsyncIterator[Resources]:
    async with AsyncExitStack() as exit_stack:
        redis = create_redis_client(redis_url=get_app_settings().redis_url)
        exit_stack.push_async_callback(redis.aclose)
        await redis.ping()  # fail at startup, not on the first request
        image_process_pool = ProcessPoolExecutor(max_workers=get_media_settings().image_processing_workers)
        exit_stack.callback(image_process_pool.shutdown, cancel_futures=True)
        s3_http_client = create_s3_http_client(settings=get_s3_api_settings())
        exit_stack.push_async_callback(s3_http_client.aclose)
        yield Resources(redis=redis, image_process_pool=image_process_pool, s3_http_client=s3_http_client)
