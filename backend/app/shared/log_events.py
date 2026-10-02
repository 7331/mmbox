from app.shared.logging import LogEvent


class HttpRequestCompleted(LogEvent):
    """No caller IP, query or body: they are personal data or secrets."""

    event_name = "http.request_completed"

    method: str
    route: str
    status_code: int
    duration_milliseconds: float
