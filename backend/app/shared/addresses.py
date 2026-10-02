import ipaddress

from fastapi import Request

from app.shared.configuration import get_proxy_settings
from app.shared.errors import InvalidRequestError

# One IPv6 subscriber holds a whole /64 and may send from any address in it.
IPV6_SUBSCRIBER_PREFIX = 64


def get_client_ip_address(request: Request) -> str:
    """The TCP peer, or the proxy's client-IP header when the peer is a trusted proxy.

    A header from any other caller carries no authority: trusting it would let a caller pick its own
    rate-limit bucket.
    """
    if request.client is None:
        return ""
    try:
        peer_address = ipaddress.ip_address(request.client.host)
    except ValueError:
        return ""
    proxy_settings = get_proxy_settings()
    if not any(peer_address in network for network in proxy_settings.trusted_cidrs):
        return str(peer_address)
    forwarded_ip = request.headers.get(proxy_settings.client_ip_header, "")
    try:
        return str(ipaddress.ip_address(forwarded_ip.strip()))
    except ValueError as error:
        raise InvalidRequestError from error


def abuse_subject_of_ip(client_ip_address: str) -> str:
    """The key per-IP limits spend on: an IPv6 client's /64, an IPv4 client's exact address."""
    try:
        address = ipaddress.ip_address(client_ip_address)
    except ValueError:
        return client_ip_address
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return str(address.ipv4_mapped)
    if isinstance(address, ipaddress.IPv4Address):
        return str(address)
    return str(ipaddress.ip_network((address, IPV6_SUBSCRIBER_PREFIX), strict=False))
