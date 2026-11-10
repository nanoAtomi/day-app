"""A person's data, for the portal (nicasso blueprint contract.md, "Your data").

Profile → "Download my data" collects GET .../export from every app; "Delete my account"
calls DELETE first and removes the account only when every app said yes. Called by
portal-api over the internal network with X-Portal-Secret = GATEWAY_SHARED_SECRET. The
gateway never sets that header, so a browser can't reach these even with a session.

The export holds the person's settings, templates and planned days - no internal ids.
Deleting the user removes everything else through the foreign keys (ON DELETE CASCADE).
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Day, Template, User, WeekdayAssignment

router = APIRouter(prefix="/api/platform/users", include_in_schema=False)


def portal_only(x_portal_secret: str | None = Header(default=None)) -> None:
    secret = settings.gateway_shared_secret
    if not secret or not x_portal_secret or not hmac.compare_digest(x_portal_secret.encode(), secret.encode()):
        raise HTTPException(status_code=403, detail="Portal only")


def _time(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


@router.get("/{user}/export", dependencies=[Depends(portal_only)])
def export(user: str, db: Session = Depends(get_db)) -> dict:
    person = db.scalar(select(User).where(User.username == user))
    if person is None:
        return {}
    templates = db.scalars(select(Template).where(Template.owner_id == person.id).order_by(Template.id)).all()
    names = {t.id: t.name for t in templates}
    weekdays = db.scalars(select(WeekdayAssignment).where(WeekdayAssignment.owner_id == person.id)).all()
    days = db.scalars(select(Day).where(Day.owner_id == person.id).order_by(Day.date)).all()
    return {
        "user": {
            "email": person.email,
            "name": person.display_name,
            "timezone": person.timezone,
            "delay_mode": person.delay_mode,
            "notify_lead_minutes": person.notify_lead_minutes,
            "since": person.created_at.isoformat(),
        },
        "templates": [
            {
                "name": t.name,
                "kind": t.kind,
                "color": t.color,
                "icon": t.icon,
                "blocks": [
                    {"start": _time(b.start_minute), "minutes": b.duration_minutes, "title": b.title,
                     "category": b.category, "subtasks": b.subtasks}
                    for b in t.blocks
                ],
            }
            for t in templates
        ],
        "weekdays": {str(w.weekday): names.get(w.template_id) for w in weekdays},
        "days": [
            {
                "date": d.date.isoformat(),
                "template": names.get(d.template_id) if d.template_id else None,
                "delay_mode": d.delay_mode,
                "blocks": [
                    {"start": _time(b.start_minute), "end": _time(b.end_minute), "title": b.title,
                     "category": b.category, "source": b.source, "status": b.status,
                     "subtasks": [{"title": s.title, "done": s.done} for s in b.subtasks]}
                    for b in d.blocks
                ],
            }
            for d in days
            if d.blocks
        ],
    }


@router.delete("/{user}", status_code=204, dependencies=[Depends(portal_only)])
def delete(user: str, db: Session = Depends(get_db)) -> Response:
    person = db.scalar(select(User).where(User.username == user))
    if person is not None:
        # Everything else hangs off the user with ON DELETE CASCADE.
        db.delete(person)
        db.commit()
    return Response(status_code=204)
