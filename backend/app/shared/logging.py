import logging
import sys

import structlog


def configure_logging() -> None:
    renderer = structlog.dev.ConsoleRenderer() if sys.stdout.isatty() else structlog.processors.JSONRenderer()
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            renderer,
        ],
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
    )
    # uvicorn's access log would be a second line per request; the request log middleware writes it.
    logging.getLogger("uvicorn.access").disabled = True
