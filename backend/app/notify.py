"""Block notifications: when a block starts, and optionally a few minutes before.

A scheduler thread checks every minute. For each person with a device that turned push
on, it looks at today's open blocks in their time zone (today is created from its
template if nobody opened it yet). NotificationLog makes every notification go out at
most once; its key holds the block's start, so a block moved later is announced again.
After downtime, notifications more than LATE_MINUTES old are dropped.
"""
import logging
import threading
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import push
from .api.days import get_or_create_day
from .db import SessionLocal
from .models import NotificationLog, PushSubscription, User

log = logging.getLogger("day.notify")

LATE_MINUTES = 10

TEXTS = {
    "de": {
        "start": "Jetzt: {title}",
        "start_body": "bis {end}",
        "soon": "In {minutes} min: {title}",
        "soon_body": "{start} – {end}",
        "test": "Benachrichtigungen funktionieren ✓",
        "test_body": "Du bekommst sie auf diesem Gerät.",
    },
    "en": {
        "start": "Now: {title}",
        "start_body": "until {end}",
        "soon": "In {minutes} min: {title}",
        "soon_body": "{start} – {end}",
        "test": "Notifications are working ✓",
        "test_body": "You'll get them on this device.",
    },
}


def _t(language: str, key: str, **values) -> str:
    return TEXTS.get(language, TEXTS["de"])[key].format(**values)


def _hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _zone(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Europe/Berlin")


def _first_time(db: Session, user_id: int, key: str) -> bool:
    """Records the notification; False if it was sent before."""
    db.add(NotificationLog(user_id=user_id, key=key))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def notify_user(db: Session, user: User, now: datetime) -> int:
    """Sends what is due for one person at `now`; returns how many notifications went out."""
    local = now.astimezone(_zone(user))
    minute = local.hour * 60 + local.minute
    day = get_or_create_day(db, user, local.date())
    sent = 0
    for block in day.blocks:
        if block.status != "open":
            continue
        moments = []
        if user.notify_start:
            moments.append(("start", block.start_minute))
        if user.notify_lead_minutes:
            moments.append(("soon", block.start_minute - user.notify_lead_minutes))
        for kind, at in moments:
            if not (at <= minute < at + LATE_MINUTES):
                continue
            key = f"{day.date.isoformat()}:{block.id}:{block.start_minute}:{kind}"
            if not _first_time(db, user.id, key):
                continue
            values = {"title": block.title, "start": _hhmm(block.start_minute), "end": _hhmm(block.end_minute), "minutes": user.notify_lead_minutes}
            push.send(db, user.id, lambda lang, kind=kind, values=values: {
                "title": _t(lang, kind, **values),
                "body": _t(lang, f"{kind}_body", **values),
                "url": "/",
                "tag": f"block-{block.id}",
            })
            sent += 1
    return sent


def run_once(now: datetime | None = None) -> int:
    """One round for everybody with a push device."""
    now = now or datetime.now(ZoneInfo("UTC"))
    total = 0
    with SessionLocal() as db:
        user_ids = db.scalars(select(PushSubscription.user_id).distinct()).all()
        for user_id in user_ids:
            user = db.get(User, user_id)
            if user is None or not (user.notify_start or user.notify_lead_minutes):
                continue
            try:
                total += notify_user(db, user, now)
            except Exception:  # one person's data must not stop the others
                db.rollback()
                log.exception("Notifications for user %s failed", user_id)
    return total


def test_message(db: Session, user: User) -> int:
    return push.send(db, user.id, lambda lang: {"title": _t(lang, "test"), "body": _t(lang, "test_body"), "url": "/settings", "tag": "test"})


class Scheduler:
    """Checks every minute in a background thread (one app instance per deployment)."""

    def __init__(self, interval_seconds: int = 60) -> None:
        self.interval = interval_seconds
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="notify", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(self.interval):
            try:
                run_once()
            except Exception:
                log.exception("Notification run failed")
