import logging
import sys
from typing import ClassVar

from pydantic import BaseModel, ConfigDict
import structlog

# uvicorn installs its own plain-text handlers before it builds the app; these are handed back to root.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


class LogEvent(BaseModel):
    """One typed log record: a fixed event name, values only in fields."""

    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)

    event_name: ClassVar[str]
    level: ClassVar[int] = logging.INFO


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.stdlib.get_logger(name)


def emit(logger: structlog.stdlib.BoundLogger, *, event: LogEvent) -> None:
    logger.log(event.level, event.event_name, **event.model_dump())


def configure_logging() -> None:
    """JSON on stdout (readable on a terminal); stdlib and uvicorn records go through the same processors."""
    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    renderer = structlog.dev.ConsoleRenderer() if sys.stdout.isatty() else structlog.processors.JSONRenderer()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.format_exc_info,
                renderer,
            ],
        )
    )
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)
    for uvicorn_logger_name in UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(uvicorn_logger_name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True
    # uvicorn's access line would be a second line per request, with the full path; log_request writes it.
    logging.getLogger("uvicorn.access").disabled = True
    # httpx logs every request URL at INFO, which would put visitors' bucket endpoints in the log.
    logging.getLogger("httpx").setLevel(logging.WARNING)
