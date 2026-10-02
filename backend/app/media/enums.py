from enum import IntEnum, StrEnum


class MediaType(StrEnum):
    PNG = "image/png"
    JPEG = "image/jpeg"
    GIF = "image/gif"
    WEBP = "image/webp"

    @property
    def extension(self) -> str:
        return MEDIA_TYPE_EXTENSIONS[self]

    @property
    def pillow_format(self) -> str:
        return MEDIA_TYPE_PILLOW_FORMATS[self]


MEDIA_TYPE_EXTENSIONS = {MediaType.PNG: "png", MediaType.JPEG: "jpg", MediaType.GIF: "gif", MediaType.WEBP: "webp"}
MEDIA_TYPE_PILLOW_FORMATS = {MediaType.PNG: "PNG", MediaType.JPEG: "JPEG", MediaType.GIF: "GIF", MediaType.WEBP: "WEBP"}


class MediaLifetimeSeconds(IntEnum):
    """The lifetimes the page offers; a product choice, not a free integer."""

    FIVE_MINUTES = 300
    FIFTEEN_MINUTES = 900
    THIRTY_MINUTES = 1800
    ONE_HOUR = 3600
    THREE_HOURS = 10800
    SIX_HOURS = 21600
    TWELVE_HOURS = 43200
    ONE_DAY = 86400
