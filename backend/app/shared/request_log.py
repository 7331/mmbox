from collections.abc import Awaitable, Callable
import time

from fastapi import Request, Response

from app.shared.log_events import HttpRequestCompleted
from app.shared.logging import emit, get_logger

logger = get_logger(__name__)


async def log_request(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:  # noqa: PLR0917  # Starlette calls middleware positionally
    """One line per request, written at the end."""
    started_at = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    emit(
        logger,
        event=HttpRequestCompleted(
            method=request.method,
            route=getattr(route, "path", "unmatched"),
            status_code=response.status_code,
            duration_milliseconds=round((time.perf_counter() - started_at) * 1000, 1),
        ),
    )
    return response
