from typing import ClassVar

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Every error the API returns: a stable `code`, an HTTP status and a message safe to show."""

    code: ClassVar[str]
    status_code: ClassVar[int]
    message: ClassVar[str]

    def response_headers(self) -> dict[str, str]:
        return {}


class InvalidRequestError(AppError):
    code = "invalid_request"
    status_code = status.HTTP_400_BAD_REQUEST
    message = "malformed request"


def render_app_error(error: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"code": error.code, "message": error.message},
        headers=error.response_headers(),
    )


def register_error_handlers(app: FastAPI) -> None:
    async def handle_app_error(request: Request, error: Exception) -> JSONResponse:  # noqa: ARG001, PLR0917  # Starlette calls handlers positionally
        assert isinstance(error, AppError)  # noqa: S101  # registered for AppError only
        return render_app_error(error)

    async def handle_validation_error(request: Request, error: Exception) -> JSONResponse:  # noqa: ARG001, PLR0917  # Starlette calls handlers positionally
        return render_app_error(InvalidRequestError())

    app.add_exception_handler(AppError, handle_app_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
