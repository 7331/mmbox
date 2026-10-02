from app.shared.logging import LogEvent


class ApplicationStarted(LogEvent):
    event_name = "application.started"


class ApplicationStopped(LogEvent):
    event_name = "application.stopped"
