from typing import Annotated

from fastapi import Depends, Request

from app.lifespan.composition import Services


def get_services(request: Request) -> Services:
    """The one typed accessor for app.state."""
    return request.app.state.services


ServicesDependency = Annotated[Services, Depends(get_services)]
