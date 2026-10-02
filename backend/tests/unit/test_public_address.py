import pytest

from app.s3_api.client import resolve_public_address
from app.s3_api.errors import ForbiddenEndpointError


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1"])
async def test_relay_refuses_private_and_local_endpoints(host: str) -> None:
    # The relay connects wherever a stranger points it; reaching Redis, RustFS or the router
    # behind it would be the worst failure this feature can have.
    with pytest.raises(ForbiddenEndpointError):
        await resolve_public_address(host, port=443)
