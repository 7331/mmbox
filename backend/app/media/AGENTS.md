# media

Owns uploaded images: validation, metadata stripping, storage with a lifetime, fetch and token delete. Rate limiting belongs to `rate_limits`.

## Key functions
- `MediaService.upload_media()`: size and type check, `strip_metadata_and_downscale()` in the image process pool, store with a fresh id and delete token. Called by `POST /api/upload`.
- `MediaService.get_media()`: serves `/{id}.{ext}`; a wrong extension is the same 404 as a missing id.
- `MediaService.delete_media()`: `DELETE /api/media/{id}` with `X-Delete-Token`.

## Data
- Redis hash `m:{id}` (`data`, `ctype`, `token`) with EXPIRE = the chosen `MediaLifetimeSeconds`. No sweeper.

## Gotchas
- A wrong token and a missing id are the same 404 on purpose (no existence oracle).
- `ImageOps.exif_transpose` collapses animations to one frame, so it runs on stills only.
- Lifetimes are a closed `MediaLifetimeSeconds` enum matching the page's choices; an unknown value is `invalid_request`.
