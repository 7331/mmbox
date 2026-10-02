from fastapi import status

from app.shared.errors import AppError


class ForbiddenEndpointError(AppError):
    code = "forbidden_endpoint"
    status_code = status.HTTP_400_BAD_REQUEST
    message = "the bucket endpoint must be a public https address"


class BucketUnreachableError(AppError):
    code = "bucket_unreachable"
    status_code = status.HTTP_502_BAD_GATEWAY
    message = "the bucket endpoint did not answer"


class BucketRejectedError(AppError):
    code = "bucket_rejected"
    status_code = status.HTTP_502_BAD_GATEWAY
    message = "the bucket refused the request; check keys, bucket name and region"
