# mmbox backend

Layers, top to bottom (`lint-imports` enforces them): `app.main` (uvicorn factory `create_app`), `app.lifespan` (`Resources`, `build_services`, the one `get_services` accessor), domains `app.bucket_relay` over `app.media` over `app.rate_limits`, infrastructure `app.s3_api` and `app.redis`, then `app.shared`.

Each domain package uses only these files: `service.py`, `store.py`, `keys.py`, `errors.py`, `configuration.py` (pydantic-settings with its own env prefix), `router.py`, `dependencies.py`, `schemas.py`, `enums.py`, plus an `AGENTS.md`. Errors are typed `AppError` subclasses rendered as `{"code", "message"}`. Logs are typed `LogEvent` records from the package's `log_events.py`, written with `emit(logger, event=...)`; structlog JSON on stdout, uvicorn's records through the same processors, one line per request.

Settings: `app/config.py` holds only what no package owns (`REDIS_URL`); every other key belongs to one package's `configuration.py` with its own prefix (`MEDIA_`, `RATE_LIMITS_`, `S3_API_`, `PROXY_` in `app/shared`). `load_all_settings` builds them all at startup.

Tests: shuffled order (pytest-randomly), 60 s timeout each, warnings are errors.

Checks: `uv run ruff format --check . && uv run ruff check . && uv run ty check && uv run lint-imports && uv run deptry . && uv run vulture && uv run codespell && uv run pytest`.

## Exceptions
- No database, task queue, CLI, migrations or tracing: everything lives in Redis with a TTL.
- `app/media/image_encoding.py` is outside the file list: it is the function the image process pool runs.
- Each domain's `dependencies.py` imports `app.lifespan.dependencies` (ignored imports in `pyproject.toml`): request injection is an entry point.
- `app/s3_api` has no fixed base URL and one `httpx.AsyncClient`: every visitor brings an endpoint. Requests go to the address `resolve_public_address` checked (TLS still verifies the hostname via `sni_hostname`), redirects off, so the relay cannot be steered at private addresses.
