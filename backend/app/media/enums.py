from enum import StrEnum


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


# Any lifetime from a minute to a week; the page offers a few presets and a custom one (owner, 2026-10-12: "We can do
# any time to expire"). Redis evicts by LRU when full, so a long lifetime is a ceiling, not a promise.
MINIMUM_LIFETIME_SECONDS = 60
MAXIMUM_LIFETIME_SECONDS = 7 * 86400
DEFAULT_LIFETIME_SECONDS = 86400
