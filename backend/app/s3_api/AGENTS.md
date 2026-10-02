# s3_api

The S3 client for visitor buckets: SigV4 signing (botocore), list parsing (defusedxml), put, delete.

- `resolve_public_address` refuses an endpoint unless every resolved address is global; the request goes to that checked address with TLS verifying the hostname (`sni_hostname`), redirects off.
- One `httpx.AsyncClient` per process, no `base_url` (every visitor brings an endpoint), timeouts from `S3_API_`.
