from collections.abc import Awaitable, Callable

from fastapi import Request, Response

# The page loads only its own hashed /assets. Fetches go to its own origin, to any https S3 bucket a
# visitor brings, and to local buckets on http://localhost; previews come from blob: and those buckets.
PAGE_CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # marker.js injects <style> elements and style attributes with computed values.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https:",
        "media-src 'self' blob: https:",
        "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
    ]
)


async def add_security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:  # noqa: PLR0917  # Starlette calls middleware positionally
    """nosniff and no referrer on every response; the content security policy on the page."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path == "/":
        response.headers["Content-Security-Policy"] = PAGE_CONTENT_SECURITY_POLICY
    return response
