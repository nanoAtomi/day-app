"""Calendar import from ICS subscription addresses (read-only, no OAuth).

Fetching: the address comes from a person, so the server must not be turned against
itself or the platform's internal network (SSRF). Only https (webcal:// is https), only
hosts that resolve to public addresses, redirects checked the same way one by one,
15 s timeout, at most 5 MB. The address works like a password: it never appears in logs
or error messages.

Syncing: every 15 minutes (the notification scheduler calls `sync_due`), for yesterday
to two weeks ahead in the person's time zone. Events of a source in that window are
replaced; older days keep what they had. All-day events are left out (holidays and
birthdays would cover the whole day); an event over midnight is split per day.
"""
import hashlib
import ipaddress
import logging
import socket
from datetime import date, datetime, time, timedelta
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
import icalendar
import recurring_ical_events
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import CalendarEvent, CalendarSource, User, utcnow

log = logging.getLogger("day.calendar")

SYNC_EVERY = timedelta(minutes=15)
WINDOW_BEFORE = timedelta(days=1)
WINDOW_AFTER = timedelta(days=14)
MAX_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 5
TIMEOUT = 15.0
DAY_MINUTES = 24 * 60


class CalendarError(Exception):
    """A problem to show the person, as a code the UI translates (never the address):
    scheme, credentials, unreachable, forbidden, http:<status>, too_big, redirects,
    not_ics, unreadable, timeout."""


def normalize_url(url: str) -> str:
    url = url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise CalendarError("scheme")
    if parts.username or parts.password:
        raise CalendarError("credentials")
    return url


def check_public_host(host: str, port: int) -> None:
    """Refuses hosts that resolve to private, loopback or otherwise internal addresses."""
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise CalendarError("unreachable") from None
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise CalendarError("forbidden")


def fetch_ics(url: str, transport: httpx.BaseTransport | None = None) -> bytes:
    """The calendar file behind the address (tests pass a fake transport or replace this)."""
    current = normalize_url(url)
    with httpx.Client(follow_redirects=False, timeout=TIMEOUT, headers={"User-Agent": "nicasso-day/1"}, transport=transport) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(current)
            check_public_host(parts.hostname or "", parts.port or 443)
            with client.stream("GET", current) as response:
                if response.is_redirect:
                    current = normalize_url(urljoin(current, response.headers.get("location", "")))
                    continue
                if response.status_code != 200:
                    raise CalendarError(f"http:{response.status_code}")
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise CalendarError("too_big")
                return bytes(body)
    raise CalendarError("redirects")


def _zone(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Europe/Berlin")


def _local(value, zone: ZoneInfo) -> datetime | None:
    """A DTSTART/DTEND value on the person's wall clock; None for all-day dates."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:  # "floating" time: already local
        return value.replace(tzinfo=zone)
    return value.astimezone(zone)


def parse_events(ics: bytes, zone: ZoneInfo, first: date, last: date) -> list[dict]:
    """Occurrences between first and last (inclusive), one entry per day they touch."""
    try:
        calendar = icalendar.Calendar.from_ical(ics)
    except ValueError:
        raise CalendarError("not_ics") from None
    start = datetime.combine(first, time.min, zone)
    end = datetime.combine(last + timedelta(days=1), time.min, zone)
    events = []
    for component in recurring_ical_events.of(calendar).between(start, end):
        begins = _local(component.get("DTSTART").dt if component.get("DTSTART") else None, zone)
        if begins is None:
            continue  # all-day
        ends = _local(component.get("DTEND").dt, zone) if component.get("DTEND") else None
        if ends is None:
            duration = component.get("DURATION")
            ends = begins + (duration.dt if duration else timedelta(hours=1))
        if ends <= begins:
            continue
        title = str(component.get("SUMMARY") or "Termin").strip()[:200] or "Termin"
        uid = str(component.get("UID") or title)
        day = begins.date()
        while day <= ends.date() and day <= last:
            day_start = datetime.combine(day, time.min, zone)
            from_minute = max(0, int((begins - day_start).total_seconds() // 60))
            to_minute = min(DAY_MINUTES, int((ends - day_start).total_seconds() // 60))
            if day >= first and to_minute > from_minute:
                key = hashlib.sha1(f"{uid}|{begins.isoformat()}".encode()).hexdigest()[:40]
                events.append({"date": day, "start_minute": from_minute, "end_minute": max(to_minute, from_minute + 5), "title": title, "key": key})
            day += timedelta(days=1)
    return events


def sync_source(db: Session, source: CalendarSource, user: User) -> int:
    """Fetches and stores one calendar; records the outcome on the source. Returns the
    number of events stored (raises CalendarError after recording it)."""
    zone = _zone(user)
    today = datetime.now(zone).date()
    first, last = today - WINDOW_BEFORE, today + WINDOW_AFTER
    source.last_sync_at = utcnow()
    try:
        events = parse_events(fetch_ics(source.url), zone, first, last)
    except CalendarError as e:
        source.last_error = str(e)[:300]
        db.commit()
        raise
    except httpx.TimeoutException:
        source.last_error = "timeout"
        db.commit()
        raise CalendarError("timeout") from None
    except httpx.HTTPError:
        source.last_error = "unreachable"
        db.commit()
        raise CalendarError("unreachable") from None
    except Exception:
        # Never log the address: only which source failed.
        log.exception("Calendar %s could not be read", source.id)
        source.last_error = "unreadable"
        db.commit()
        raise CalendarError(source.last_error) from None
    db.execute(delete(CalendarEvent).where(CalendarEvent.source_id == source.id, CalendarEvent.date >= first, CalendarEvent.date <= last))
    for e in events:
        db.add(CalendarEvent(source_id=source.id, owner_id=source.owner_id, **e))
    source.last_error = None
    db.commit()
    return len(events)


def sync_due(db: Session) -> None:
    """Every calendar not synced for 15 minutes (called by the scheduler every minute)."""
    due = utcnow() - SYNC_EVERY
    for source in db.scalars(select(CalendarSource).where((CalendarSource.last_sync_at.is_(None)) | (CalendarSource.last_sync_at < due))).all():
        user = db.get(User, source.owner_id)
        if user is None:
            continue
        try:
            sync_source(db, source, user)
        except CalendarError:
            pass  # recorded on the source, shown in Settings
