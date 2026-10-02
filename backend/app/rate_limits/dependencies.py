from fastapi import Request

from app.config import get_app_settings
from app.lifespan.dependencies import ServicesDependency
from app.shared.addresses import get_caller_ip


async def check_upload_rate_limit(*, request: Request, services: ServicesDependency) -> None:
    await services.rate_limits.check_upload(
        caller_ip=get_caller_ip(request, trusted_client_ip_header=get_app_settings().trusted_client_ip_header)
    )


async def check_fetch_rate_limit(*, request: Request, services: ServicesDependency) -> None:
    await services.rate_limits.check_fetch(
        caller_ip=get_caller_ip(request, trusted_client_ip_header=get_app_settings().trusted_client_ip_header)
    )
