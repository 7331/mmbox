from io import BytesIO

from PIL import Image

from app.media.enums import MediaType
from app.media.image_encoding import strip_metadata_and_downscale


def test_jpeg_location_metadata_is_stripped() -> None:
    exif = Image.Exif()
    exif[0x8825] = {2: (52.0, 22.0, 0.0)}  # GPS latitude
    source = BytesIO()
    Image.new("RGB", (8, 8)).save(source, format="JPEG", exif=exif)

    stripped = strip_metadata_and_downscale(source.getvalue(), media_type=MediaType.JPEG, max_dimension_pixels=4096)

    with Image.open(BytesIO(stripped)) as result:
        assert not result.getexif()


def test_animated_gif_stays_animated_when_downscaled() -> None:
    frames = [Image.new("RGB", (64, 32), color) for color in ("red", "green", "blue")]
    source = BytesIO()
    frames[0].save(source, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)

    stripped = strip_metadata_and_downscale(source.getvalue(), media_type=MediaType.GIF, max_dimension_pixels=16)

    with Image.open(BytesIO(stripped)) as result:
        assert result.n_frames == 3
        assert result.size == (16, 8)
