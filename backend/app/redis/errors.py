from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app.shared.errors import AppError, render_app_error


class StoreUnavailableError(AppError):
    code = "store_unavailable"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "storage backend is unavailable, try again shortly"


def register_redis_error_handler(app: FastAPI) -> None:
    async def handle_redis_error(request: Request, error: Exception) -> JSONResponse:  # noqa: ARG001, PLR0917  # Starlette calls handlers positionally
        return render_app_error(StoreUnavailableError())

    app.add_exception_handler(RedisError, handle_redis_error)
