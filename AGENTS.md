# mmbox contributor rules

FastAPI + Redis in `backend/`, Vite SPA in `frontend/`, one Compose stack. Read `backend/AGENTS.md` before changing backend code and the domain's own `AGENTS.md` before changing a domain.

- Redis runs without persistence and with `allkeys-lru`: server-hosted images are ephemeral by design, never durable storage.
- Visitors bring their own S3-compatible bucket (`frontend/src/bucket.ts`): direct from the browser when the bucket has CORS (any size, video), otherwise the backend relay `app/bucket_relay` (images only, stripped, keys per request and never stored or logged, private and non-https endpoints refused by `resolve_public_address`).
- Bucket keys are remembered in the browser (`localStorage`) by default; the setup text pushes a key scoped to one bucket.
- Security headers are set by the app (`backend/app/shared/security_headers.py`), not a proxy: nosniff and no-referrer everywhere, a CSP on `/`. `style-src` keeps 'unsafe-inline' because marker.js injects styles; scripts stay 'self' only.
- Client IP for rate limits comes from the socket peer unless `TRUSTED_CLIENT_IP_HEADER` names a header your proxy overwrites. Never trust `X-Forwarded-For` blindly.
- Tests stay minimal: the main path and the failure that would hurt most. Verify against the running stack (curl, the browser) first.
- Names are explicit and long form; signatures are keyword-only past the first argument (ruff enforces it).
