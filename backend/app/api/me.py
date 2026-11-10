"""The signed-in user and their settings."""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user
from ..config import settings
from ..db import get_db
from ..models import DELAY_MODES, User

router = APIRouter(prefix="/api/me", tags=["me"])


class MeResponse(BaseModel):
    id: int
    username: str
    email: str | None
    display_name: str
    timezone: str
    delay_mode: str
    notify_lead_minutes: int | None
    notify_start: bool
    # Platform links (set by the portal); null outside the gateway.
    portal_url: str | None
    logout_url: str | None
    feedback_url: str | None
    # A superuser's "view as" (X-Auth-Request-View from the gateway); null for everyone else.
    view: str | None = None


class MeUpdate(BaseModel):
    # The name comes from the portal profile (X-Auth-Request-Name), not from here.
    timezone: str | None = None
    delay_mode: str | None = None
    # -1 = no advance notice (only at the start of a block).
    notify_lead_minutes: int | None = Field(default=None, ge=-1, le=240)
    notify_start: bool | None = None


def _response(request: Request, user: User) -> MeResponse:
    gateway = settings.auth_mode == "gateway"
    portal_url = (settings.portal_url or None) if gateway else None
    return MeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        timezone=user.timezone,
        delay_mode=user.delay_mode,
        notify_lead_minutes=user.notify_lead_minutes,
        notify_start=user.notify_start,
        portal_url=portal_url,
        logout_url=(settings.portal_logout_url or None) if gateway else None,
        feedback_url=f"{portal_url}/feedback?app=day" if portal_url else None,
        view=(request.headers.get("x-auth-request-view") or None) if gateway else None,
    )


@router.get("", response_model=MeResponse)
def get_me(request: Request, user: User = Depends(current_user)) -> MeResponse:
    return _response(request, user)


@router.patch("", response_model=MeResponse)
def update_me(request: Request, body: MeUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> MeResponse:
    if body.timezone is not None:
        try:
            ZoneInfo(body.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status_code=422, detail="Unknown time zone") from None
        user.timezone = body.timezone
    if body.delay_mode is not None:
        if body.delay_mode not in DELAY_MODES:
            raise HTTPException(status_code=422, detail=f"delay_mode must be one of {', '.join(DELAY_MODES)}")
        user.delay_mode = body.delay_mode
    if body.notify_lead_minutes is not None:
        user.notify_lead_minutes = None if body.notify_lead_minutes < 0 else body.notify_lead_minutes
    if body.notify_start is not None:
        user.notify_start = body.notify_start
    db.add(user)
    db.commit()
    return _response(request, user)
