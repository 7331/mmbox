from fastapi import status

from app.shared.errors import AppError


class RateLimitedError(AppError):
    code = "rate_limited"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    message = "too many requests, slow down"

    def __init__(self, *, retry_after_seconds: int) -> None:
        super().__init__()
        self.retry_after_seconds = retry_after_seconds

    def response_headers(self) -> dict[str, str]:
        return {"Retry-After": str(self.retry_after_seconds)}
