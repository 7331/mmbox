from fastapi import Request


def get_caller_ip(request: Request, *, trusted_client_ip_header: str | None) -> str:
    """The client address rate limits are keyed on.

    Only a header set by a proxy you control may be trusted (Cloudflare's CF-Connecting-IP, for
    example). X-Forwarded-For's leftmost entry is client-controlled, and trusting any header
    without such a proxy in front lets a caller pick its own bucket and dodge the limits.
    """
    if trusted_client_ip_header:
        forwarded_ip = request.headers.get(trusted_client_ip_header)
        if forwarded_ip:
            return forwarded_ip.strip()
    return request.client.host if request.client else "unknown"
