from functools import lru_cache

from pydantic import IPvAnyNetwork
from pydantic_settings import BaseSettings, SettingsConfigDict


class ProxySettings(BaseSettings):
    """Reverse-proxy peers allowed to supply the client IP. Empty: every caller is its TCP peer."""

    model_config = SettingsConfigDict(env_prefix="PROXY_", extra="ignore")

    # Exact proxy addresses (/32 or /128), never a whole Docker bridge or a CDN's ranges.
    trusted_cidrs: list[IPvAnyNetwork] = []
    # A header the trusted proxy overwrites on every request (Caddy behind Cloudflare: CF-Connecting-IP).
    client_ip_header: str = "cf-connecting-ip"


@lru_cache
def get_proxy_settings() -> ProxySettings:
    return ProxySettings()
