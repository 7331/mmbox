from fastapi import Request

from app.lifespan.dependencies import ServicesDependency
from app.shared.addresses import abuse_subject_of_ip, get_client_ip_address


async def check_upload_rate_limit(*, request: Request, services: ServicesDependency) -> None:
    await services.rate_limits.check_upload(caller_ip=abuse_subject_of_ip(get_client_ip_address(request)))


async def check_fetch_rate_limit(*, request: Request, services: ServicesDependency) -> None:
    await services.rate_limits.check_fetch(caller_ip=abuse_subject_of_ip(get_client_ip_address(request)))
