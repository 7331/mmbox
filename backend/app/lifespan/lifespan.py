from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.lifespan.composition import build_services, open_resources
from app.lifespan.log_events import ApplicationStarted, ApplicationStopped
from app.shared.logging import emit, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the resources and build the services on startup; close them on shutdown."""
    async with open_resources() as resources:
        app.state.services = build_services(resources)
        emit(logger, event=ApplicationStarted())
        yield
    emit(logger, event=ApplicationStopped())
