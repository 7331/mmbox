# bucket_relay

Talks to a visitor's bucket when the bucket has no CORS: check, list, image upload, delete (`POST /api/buckets/*`).

- The connection (endpoint, keys) comes with each request and is never stored or logged.
- Uploads go through `MediaService.prepare_image`, so relayed images are stripped like server drops. Images only.
- Every call goes through `app/s3_api`, which refuses non-https and non-public endpoints.
