from collections.abc import Awaitable, Callable
import time

from fastapi import Request, Response
import structlog

logger = structlog.get_logger()


async def log_request(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:  # noqa: PLR0917  # Starlette calls middleware positionally
    """One line per request. No caller IP, query or body: they are personal data or secrets."""
    started_at = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    logger.info(
        "http.request_completed",
        method=request.method,
        route=getattr(route, "path", "unmatched"),
        status_code=response.status_code,
        duration_milliseconds=round((time.perf_counter() - started_at) * 1000, 1),
    )
    return response
