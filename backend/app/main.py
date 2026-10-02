from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

from app.bucket_relay.router import router as bucket_relay_router
from app.lifespan.lifespan import lifespan
from app.media.router import router as media_router
from app.redis.errors import register_redis_error_handler
from app.shared.errors import register_error_handlers
from app.shared.logging import configure_logging
from app.shared.request_log import log_request
from app.shared.security_headers import add_security_headers

# backend/app/main.py -> repository root (/srv/mmbox in the image) -> frontend/dist.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class HealthResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="mmbox", lifespan=lifespan)
    register_error_handlers(app)
    register_redis_error_handler(app)
    app.middleware("http")(add_security_headers)
    app.middleware("http")(log_request)

    @app.get("/health")
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-store, max-age=0"})

    # Registered before the media router, whose `/{media_id}.{extension}` would not match
    # `/assets/...` anyway (two segments).
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False), name="frontend-assets")
    app.include_router(bucket_relay_router)
    app.include_router(media_router)
    return app
