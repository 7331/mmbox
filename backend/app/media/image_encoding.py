"""Runs in the image process pool: plain arguments in, bytes out, no I/O."""

from io import BytesIO

from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

from app.media.enums import MediaType
from app.media.errors import InvalidImageError, MediaTooLargeError

# Pixel-affecting info keys survive; everything else Pillow carries in .info (exif, icc_profile,
# PNG text chunks, GIF comments, XMP) is metadata and is dropped.
PIXEL_INFO_KEYS = frozenset({"transparency", "duration", "disposal", "loop", "background"})


def strip_metadata_and_downscale(data: bytes, *, media_type: MediaType, max_dimension_pixels: int) -> bytes:
    """Re-encode without metadata, downscaling every frame past `max_dimension_pixels`.
    Animated GIFs and WebPs stay animated."""
    try:
        with Image.open(BytesIO(data)) as source:
            # exif_transpose collapses a multi-frame image to one frame, and only stills carry
            # an EXIF orientation, so it runs on stills only.
            image = source if getattr(source, "n_frames", 1) > 1 else ImageOps.exif_transpose(source)
            frames = [strip_frame_metadata(frame) for frame in ImageSequence.Iterator(image)]
            longest_side = max(frames[0].size)
            if longest_side > max_dimension_pixels:
                frames = [scale_frame(frame, factor=max_dimension_pixels / longest_side) for frame in frames]
            return encode_frames(frames, media_type=media_type, loop=int(image.info.get("loop", 0)))
    except Image.DecompressionBombError as error:
        raise MediaTooLargeError from error
    except (UnidentifiedImageError, ValueError, OSError) as error:
        raise InvalidImageError from error


def strip_frame_metadata(frame: Image.Image) -> Image.Image:
    copied = frame.copy()
    copied.info = {key: value for key, value in frame.info.items() if key in PIXEL_INFO_KEYS}
    return copied


def scale_frame(frame: Image.Image, *, factor: float) -> Image.Image:
    size = (max(1, round(frame.width * factor)), max(1, round(frame.height * factor)))
    return frame.resize(size, Image.Resampling.LANCZOS)


def encode_frames(frames: list[Image.Image], *, media_type: MediaType, loop: int) -> bytes:
    output = BytesIO()
    first_frame = frames[0]
    if len(frames) > 1:
        # Only GIF has frame disposal; dropping it misrenders GIFs that restore to background.
        disposal = (
            {"disposal": [int(frame.info.get("disposal", 0)) for frame in frames]}
            if media_type is MediaType.GIF
            else {}
        )
        first_frame.save(
            output,
            format=media_type.pillow_format,
            save_all=True,
            append_images=frames[1:],
            loop=loop,
            duration=[int(frame.info.get("duration", 0)) for frame in frames],
            **disposal,
        )
    elif media_type is MediaType.JPEG:
        # A frame copy has no source quantization tables to keep; 95 is visually lossless.
        first_frame.save(output, format="JPEG", quality=95)
    else:
        first_frame.save(output, format=media_type.pillow_format)
    return output.getvalue()
