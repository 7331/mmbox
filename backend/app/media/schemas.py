from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UploadResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str
    id: str
    expires_at: datetime
    ttl: int
    # Authorises DELETE: handed out once, never derivable from the URL.
    delete_token: str


class DeleteResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    id: str
