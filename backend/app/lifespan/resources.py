from concurrent.futures import ProcessPoolExecutor

import httpx
from pydantic import BaseModel, ConfigDict
from redis.asyncio import Redis


class Resources(BaseModel):
    """Every client the process holds, opened once by `open_resources`."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    redis: Redis
    image_process_pool: ProcessPoolExecutor
    s3_http_client: httpx.AsyncClient
