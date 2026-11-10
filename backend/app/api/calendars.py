"""Calendar subscriptions (ICS addresses) of the signed-in person. The address is
write-only: answers show only its host, so it never travels back to a browser."""
from datetime import datetime
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..calendar_sync import CalendarError, normalize_url, sync_source
from ..db import get_db
from ..models import CalendarEvent, CalendarSource, User

router = APIRouter(prefix="/api/calendars", tags=["calendars"])

COLORS = ("slate", "blue", "teal", "amber", "rose", "violet")
MAX_SOURCES = 10


class CalendarOut(BaseModel):
    id: int
    name: str
    color: str
    host: str
    last_sync_at: datetime | None
    # An error code (see calendar_sync.CalendarError), None when the last sync worked.
    last_error: str | None
    events: int


class CalendarCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=10, max_length=2000)
    color: str = "slate"


class CalendarUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = None


def _out(db: Session, source: CalendarSource) -> CalendarOut:
    count = db.scalar(select(func.count(CalendarEvent.id)).where(CalendarEvent.source_id == source.id)) or 0
    return CalendarOut(
        id=source.id, name=source.name, color=source.color, host=urlsplit(source.url).hostname or "",
        last_sync_at=source.last_sync_at, last_error=source.last_error, events=count,
    )


def _own(db: Session, user: User, source_id: int) -> CalendarSource:
    source = db.scalar(select(CalendarSource).where(CalendarSource.id == source_id, CalendarSource.owner_id == user.id))
    if source is None:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return source


def _check_color(color: str) -> None:
    if color not in COLORS:
        raise HTTPException(status_code=422, detail=f"color must be one of {', '.join(COLORS)}")


@router.get("", response_model=list[CalendarOut])
def list_calendars(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[CalendarOut]:
    sources = db.scalars(select(CalendarSource).where(CalendarSource.owner_id == user.id).order_by(CalendarSource.id)).all()
    return [_out(db, s) for s in sources]


@router.post("", response_model=CalendarOut, status_code=201)
def add_calendar(body: CalendarCreate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> CalendarOut:
    """Adds a calendar and reads it right away; an address that can't be read is refused."""
    _check_color(body.color)
    count = db.scalar(select(func.count(CalendarSource.id)).where(CalendarSource.owner_id == user.id)) or 0
    if count >= MAX_SOURCES:
        raise HTTPException(status_code=422, detail={"code": "too_many"})
    try:
        url = normalize_url(body.url)
    except CalendarError as e:
        raise HTTPException(status_code=422, detail={"code": str(e)}) from None
    source = CalendarSource(owner_id=user.id, name=body.name.strip(), url=url, color=body.color)
    db.add(source)
    db.commit()
    try:
        sync_source(db, source, user)
    except CalendarError as e:
        db.delete(source)
        db.commit()
        raise HTTPException(status_code=422, detail={"code": str(e)}) from None
    return _out(db, source)


@router.patch("/{source_id}", response_model=CalendarOut)
def update_calendar(source_id: int, body: CalendarUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)) -> CalendarOut:
    source = _own(db, user, source_id)
    if body.name is not None:
        source.name = body.name.strip()
    if body.color is not None:
        _check_color(body.color)
        source.color = body.color
    db.commit()
    return _out(db, source)


@router.post("/{source_id}/sync", response_model=CalendarOut)
def sync_calendar(source_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> CalendarOut:
    source = _own(db, user, source_id)
    try:
        sync_source(db, source, user)
    except CalendarError:
        pass  # recorded in last_error
    return _out(db, source)


@router.delete("/{source_id}", status_code=204)
def delete_calendar(source_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.delete(_own(db, user, source_id))
    db.commit()
    return Response(status_code=204)
