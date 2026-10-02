from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# Media ids and delete tokens are both 128 random bits as 32 lowercase hex characters.
HEX_128_BIT_PATTERN = r"^[0-9a-f]{32}$"
MediaId = Annotated[str, Field(pattern=HEX_128_BIT_PATTERN)]
DeleteToken = Annotated[str, Field(pattern=HEX_128_BIT_PATTERN)]


class UploadResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str
    id: MediaId
    expires_at: datetime
    ttl: int
    # Authorises DELETE: handed out once, never derivable from the URL.
    delete_token: DeleteToken


class DeleteResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: str
    id: MediaId
