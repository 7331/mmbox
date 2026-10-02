# lifespan

Opens the process's clients once and builds the services. Sits above every domain.

- `resources.py`: `Resources`, the frozen model of opened clients (Redis, the image process pool, the S3 HTTP client).
- `composition.py`: `load_all_settings`, `open_resources` (one `AsyncExitStack`, reverse-order close) and `build_services`, the one place domains are wired.
- `lifespan.py`: the API lifespan; stores `Services` on `app.state`.
- `dependencies.py`: `get_services`, the only reader of `app.state`.
