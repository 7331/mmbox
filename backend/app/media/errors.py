from fastapi import status

from app.shared.errors import AppError


class InvalidMediaTypeError(AppError):
    code = "invalid_type"
    status_code = status.HTTP_400_BAD_REQUEST
    message = "only png, jpeg, gif and webp images are accepted"


class InvalidImageError(AppError):
    code = "invalid_image"
    status_code = status.HTTP_400_BAD_REQUEST
    message = "file bytes could not be decoded as an image"


class MediaTooLargeError(AppError):
    code = "too_large"
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    message = "file is too large"


class MediaNotFoundError(AppError):
    code = "not_found"
    status_code = status.HTTP_404_NOT_FOUND
    message = "no media with that id, or it has expired"
