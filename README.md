# mmbox

A mobile-friendly web viewer and uploader for any S3-compatible bucket (R2, RustFS, MinIO, AWS S3,
Backblaze B2, ...), plus ephemeral image drops for when you have no bucket. Self-hosted, MIT licensed.

- **Ephemeral drops:** drop, paste or pick an image and get a raw URL that deletes itself after
  5 minutes to 24 hours. EXIF, GPS and other metadata are stripped on the server; animated GIFs stay
  animated. No accounts, no gallery.
- **Your own bucket:** paste an endpoint, bucket and key. With CORS on the bucket the browser
  talks to it directly (any size, video included); without CORS the server relays images for you.
  Browse, copy, open and delete what is in the bucket.

Bytes for drops live in Redis with `EXPIRE` and no persistence, so expiry is exact and a restart
forgets everything. Uploads are open but rate-limited per client IP; file URLs are public by design.

Deleting early needs no account: every upload returns a one-off `delete_token`, stored
beside the blob and never derivable from the URL. Whoever holds it can `DELETE` the image;
whoever holds only the URL cannot. The browser keeps its tokens locally (see below), so
"delete now" works from the page that uploaded, and nowhere else.

## API

| Method | Path                 | Auth                | Body / params                          | Response                                        |
| ------ | -------------------- | ------------------- | -------------------------------------- | ----------------------------------------------- |
| POST   | `/api/upload`        | rate limit only     | multipart `file`, form field `ttl` (seconds, from the allow-list; default 86400) | `{"url", "id", "expires_at", "ttl", "delete_token"}` |
| DELETE | `/api/media/{id}`    | `X-Delete-Token`    | 32 lowercase hex id                    | `{"status": "deleted", "id"}`, or 404 when the id is unknown *or* the token is wrong |
| GET    | `/{id}.{ext}`        | none                | 32 lowercase hex id, ext in png/jpg/gif/webp | raw bytes with the stored content-type, or 404 `{"code":"not_found"}` |
| GET    | `/health`            | none                | —                                      | `{"status": "ok"}`                              |

A wrong token and a missing image are the same 404 on purpose: a distinguishable response
would turn the endpoint into an existence oracle for ids that are otherwise unguessable.

Accepted content types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`. Max 25 MiB (`MEDIA_MAX_SIZE_BYTES`).
TTL allow-list (seconds): 300, 900, 1800, 3600, 10800, 21600, 43200, 86400.
Errors are always `{"code", "message"}`: `invalid_type`/`invalid_image`/
`invalid_request` (400, also for a ttl outside the allow-list or a malformed id), `too_large` (413), `not_found` (404), `rate_limited` (429, with `Retry-After`).

Rate limits are per client IP (the socket peer, or the header named by
`TRUSTED_CLIENT_IP_HEADER` when a proxy you control sets it, e.g. `CF-Connecting-IP` behind
Cloudflare), fixed windows counted in Redis:
30 uploads/hour and 120 fetches/minute by default (`RATE_LIMITS_UPLOADS_PER_HOUR`,
`RATE_LIMITS_FETCHES_PER_MINUTE`).

## curl

```sh
curl -F file=@x.png -F ttl=3600 https://mmbox.example/api/upload
# {"url":"/<id>.png","id":"<id>","expires_at":"…","ttl":3600,"delete_token":"<32-hex>"}

curl -X DELETE -H "X-Delete-Token: <32-hex>" https://mmbox.example/api/media/<id>
# {"status":"deleted","id":"<id>"}
```

## ShareX

Destination type: **Image uploader**, method POST, body **Form data (multipart/form-data)**:

```json
{
  "Version": "16.0.0",
  "Name": "mmbox",
  "DestinationType": "ImageUploader",
  "RequestMethod": "POST",
  "RequestURL": "https://mmbox.example/api/upload",
  "Body": "MultipartFormData",
  "Arguments": {
    "ttl": "86400"
  },
  "FileFormName": "file",
  "URL": "https://mmbox.example$json:url$"
}
```

## Run

```sh
docker compose up --build -d
```

Copy `.env.example` to `.env` first. The app listens on `${WEB_PORT:-8099}`; put any TLS proxy in
front (Caddy, nginx, Cloudflare Tunnel). Visitor buckets need https, so serve mmbox over https too.
Host-specific networking goes in a `docker-compose.override.yml`, which is gitignored.

## Gates (backend/)

```sh
uv sync
uv run ruff format --check . && uv run ruff check . && uv run ty check && uv run lint-imports && uv run deptry . && uv run vulture && uv run pytest
```

## The page

Choose, drop, or paste an image, optionally edit a still, then choose its lifetime and
create the link. The review screen keeps Edit beside Change; the expiry choice sits with the final
Create link action. The full-screen
editor uses explicit Cancel/Done controls and larger touch targets on narrow screens. The
result shows the raw URL and exact expiry date, attempts to copy the link, and exposes
compact copy/share controls. Animated GIFs and WebPs skip editing instead of being
silently flattened.

The device-local shelf is a compact list with a thumbnail, randomized display label, live
countdown, full expiry date, and copy/share/download/delete actions. Deleting asks for
confirmation because it immediately breaks the public link; copy, share, open, and
download do not.

The shelf survives a reload: each upload's thumbnail (~320px JPEG), URL, expiry and delete
token go into IndexedDB (`mmbox` / `uploads`), so history is per-device and holds pixels
rather than links; an expired row still shows what it was. Records are swept a day past
expiry. Original bytes and original filenames are never persisted. The multipart filename
is randomized before upload, the public and delete ids are independent random 128-bit
values, and the server re-encodes pixels without EXIF, ICC, XMP, text chunks, or comments.
Private-mode browsers can refuse IndexedDB outright; the page says so once and keeps
working without history.

## Use my own bucket

The header button opens "Use my own bucket": S3 endpoint, bucket, region, access key, secret,
the bucket's public URL and an optional folder, saved in this browser only (`localStorage`).
"Test and save" picks the mode:

- **Direct** (bucket has a CORS policy for this origin): uploads are signed in the browser
  (aws4fetch, SigV4) and PUT straight to the bucket. Any size, video included. Still images are
  redrawn on a canvas first so EXIF, GPS and ICC never leave the browser.
- **Relay** (no CORS): `POST /api/buckets/{check,objects,upload,delete}` with the connection in the
  body. Images only, 25 MB, stripped on the server like any upload; keys travel per request and
  are never stored or logged. Endpoints must be public `https`; private, loopback and link-local
  addresses are refused, and the connection is pinned to the checked address.

The dialog shows the CORS policy and a one-line `aws s3api put-bucket-cors` command. Below the
shelf, "In your bucket" lists the folder (thumbnails from the public URL) with copy, open and
delete. A bucket on a laptop works through a tunnel (`cloudflared tunnel --url
http://localhost:9000`, `tailscale funnel`); use the tunnel URL for both endpoint and public URL.
Tested against RustFS 1.0.0 behind a Cloudflare quick tunnel, in both modes.

## Frontend

The page is a Vite + TypeScript SPA in `frontend/`, styled with Tailwind CSS and Preline
components, built to `frontend/dist/` and served by the app at `/` (hashed assets under
`/assets`). Marker.js comes from pinned npm packages and is still loaded lazily — the
editor bundle only downloads after an image is selected; the free linkware attribution
remains visible.

```sh
cd frontend
npm install
npm run dev    # proxies /api and media URLs to localhost:8099
npm run build  # emits frontend/dist/
```

`docker compose up --build` runs the same build in a node stage of `backend/Dockerfile`,
so the image stays self-contained.

## License

MIT, see `LICENSE`. The image editor is [marker.js](https://markerjs.com) under its free linkware
license, which requires the visible attribution link the editor shows.
