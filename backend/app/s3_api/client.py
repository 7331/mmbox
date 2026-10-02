import asyncio
from datetime import datetime
import ipaddress
import socket
from urllib.parse import quote, urlencode

from botocore.auth import S3SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
from defusedxml import ElementTree
import httpx

from app.s3_api.configuration import S3ApiSettings
from app.s3_api.errors import BucketRejectedError, BucketUnreachableError, ForbiddenEndpointError
from app.s3_api.models import ObjectListing, ObjectSummary, S3Connection, S3Request

S3_XML_NAMESPACE = "{http://s3.amazonaws.com/doc/2006-03-01/}"
HTTPS_DEFAULT_PORT = 443


class S3ApiClient:
    """Signed S3 calls to a visitor's endpoint. The relay is an SSRF surface: every request is sent
    to an address resolved and checked here, never to whatever DNS answers a second time."""

    def __init__(self, *, http_client: httpx.AsyncClient, settings: S3ApiSettings) -> None:
        self.http_client = http_client
        self.settings = settings

    async def put_object(self, connection: S3Connection, *, key: str, data: bytes, content_type: str) -> None:
        await self.send(
            connection, request=S3Request(method="PUT", key=key, body=data, headers={"content-type": content_type})
        )

    async def delete_object(self, connection: S3Connection, *, key: str) -> None:
        await self.send(connection, request=S3Request(method="DELETE", key=key))

    async def list_objects(
        self, connection: S3Connection, *, prefix: str, continuation_token: str | None
    ) -> ObjectListing:
        query = {"list-type": "2", "max-keys": "100", "prefix": prefix}
        if continuation_token:
            query["continuation-token"] = continuation_token
        response = await self.send(connection, request=S3Request(method="GET", key="", query=query))
        if len(response.content) > self.settings.max_listing_bytes:
            raise BucketRejectedError
        return parse_listing(response.content)

    async def send(self, connection: S3Connection, *, request: S3Request) -> httpx.Response:
        method, key, body, headers, query = request.method, request.key, request.body, request.headers, request.query
        host = connection.endpoint.host or ""
        port = connection.endpoint.port or HTTPS_DEFAULT_PORT
        if connection.endpoint.scheme != "https":
            raise ForbiddenEndpointError
        address = await resolve_public_address(host, port=port)
        path = f"/{quote(connection.bucket)}/{quote(key, safe='/~')}" if key else f"/{quote(connection.bucket)}"
        query_string = f"?{urlencode(sorted(query.items()), quote_via=quote)}" if query else ""
        port_suffix = "" if port == HTTPS_DEFAULT_PORT else f":{port}"
        signed_headers = sign_request(
            connection,
            method=method,
            url=f"https://{host}{port_suffix}{path}{query_string}",
            body=body,
            # The URL below targets the pinned IP, so Host must name the visitor's endpoint.
            headers={**headers, "host": f"{host}{port_suffix}"},
        )
        host_for_url = f"[{address}]" if ":" in address else address
        try:
            response = await self.http_client.request(
                method,
                f"https://{host_for_url}:{port}{path}{query_string}",
                content=body,
                headers=signed_headers,
                # TLS still names and verifies the visitor's hostname; only the TCP target is pinned.
                extensions={"sni_hostname": host},
            )
        except httpx.HTTPError as error:
            raise BucketUnreachableError from error
        if response.status_code == httpx.codes.NOT_FOUND and method == "DELETE":
            return response
        if not response.is_success:
            raise BucketRejectedError
        return response


async def resolve_public_address(host: str, *, port: int) -> str:
    """First resolved address, only when every resolved address is public."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise BucketUnreachableError from error
    addresses = [str(info[4][0]) for info in infos]
    if not addresses or not all(ipaddress.ip_address(address).is_global for address in addresses):
        raise ForbiddenEndpointError
    return addresses[0]


def sign_request(
    connection: S3Connection, *, method: str, url: str, body: bytes, headers: dict[str, str]
) -> dict[str, str]:
    request = AWSRequest(method=method, url=url, data=body, headers=headers)
    credentials = Credentials(connection.access_key_id, connection.secret_access_key.get_secret_value())
    S3SigV4Auth(credentials, "s3", connection.region).add_auth(request)
    return dict(request.headers.items())


def parse_listing(document: bytes) -> ObjectListing:
    root = ElementTree.fromstring(document)
    objects = [
        ObjectSummary(
            key=element.findtext(f"{S3_XML_NAMESPACE}Key", default=""),
            size_bytes=int(element.findtext(f"{S3_XML_NAMESPACE}Size", default="0")),
            last_modified_at=datetime.fromisoformat(element.findtext(f"{S3_XML_NAMESPACE}LastModified", default="")),
        )
        for element in root.iter(f"{S3_XML_NAMESPACE}Contents")
    ]
    truncated = root.findtext(f"{S3_XML_NAMESPACE}IsTruncated") == "true"
    token = root.findtext(f"{S3_XML_NAMESPACE}NextContinuationToken") if truncated else None
    return ObjectListing(objects=objects, next_continuation_token=token)
