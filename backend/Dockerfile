FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS frontend

WORKDIR /build

# Deps layer: cached until the manifest or lockfile changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim@sha256:0741d101873c12ab927e6f8653feb8862b9bd58771177acb1b885b95141f91b4 AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.22@sha256:f513a91fc62fe7c17567eee97230dd198e43edb8a9fbecca843714a4358fe1bc /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0 \
    UV_PROJECT_ENVIRONMENT=/srv/mmbox/backend/.venv

WORKDIR /build

# Deps layer: cached until the lockfile or manifest changes.
RUN --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev --no-editable

# Project layer: hatchling needs the package and the readme pyproject references.
COPY backend/app ./app
COPY backend/README.md ./README.md
RUN --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-editable

FROM python:3.14-slim@sha256:0741d101873c12ab927e6f8653feb8862b9bd58771177acb1b885b95141f91b4

RUN useradd --create-home --uid 1000 app

# The app resolves the frontend build relative to its own package
# (<root>/backend/app/... -> <root>/frontend/dist), so the image keeps the repo layout.
# The venv lives at its final path in the builder (UV_PROJECT_ENVIRONMENT) so script shebangs
# stay valid after the copy.
COPY --from=builder --chown=app:app /srv/mmbox/backend/.venv /srv/mmbox/backend/.venv
COPY --chown=app:app backend/app /srv/mmbox/backend/app
COPY --from=frontend --chown=app:app /build/dist /srv/mmbox/frontend/dist

ENV PATH="/srv/mmbox/backend/.venv/bin:$PATH"
WORKDIR /srv/mmbox/backend
USER app

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "20"]
