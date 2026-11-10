"""Statistics: how much of the plan really happened.

A block counts once it is over (today: blocks that ended before now). Done counts for
the plan, skipped and still-open (missed) against it. A day is "good" at 80 % or more;
the streak counts good days back from today - days with nothing planned neither count
nor break it, so a free Sunday doesn't end a streak.
"""
from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..db import get_db
from ..models import Day, User
from . import days as days_api

router = APIRouter(prefix="/api/stats", tags=["stats"])

GOOD_DAY = 0.8
STREAK_LOOKBACK_DAYS = 365
TOP_SKIPPED = 5


class Counts(BaseModel):
    done: int = 0
    skipped: int = 0
    missed: int = 0

    @property
    def total(self) -> int:
        return self.done + self.skipped + self.missed


class DayStats(Counts):
    date: date
    # done / (done + skipped + missed); None when nothing was due.
    rate: float | None


class WeekStats(Counts):
    # Monday of the week.
    start: date
    rate: float | None


class Skipped(BaseModel):
    title: str
    skipped: int
    total: int


class StatsOut(BaseModel):
    days: list[DayStats]
    weeks: list[WeekStats]
    streak: int
    often_skipped: list[Skipped]


def _rate(c: Counts) -> float | None:
    return round(c.done / c.total, 3) if c.total else None


def _count(day: Day, today: date, now_minute: int) -> tuple[Counts, list[tuple[str, str]]]:
    """Counts of one day, plus (title, status) of every block that counted."""
    counts = Counts()
    seen = []
    for b in day.blocks:
        if day.date > today or (day.date == today and b.end_minute > now_minute):
            continue  # not over yet
        if b.status == "done":
            counts.done += 1
        elif b.status == "skipped":
            counts.skipped += 1
        else:
            counts.missed += 1
        seen.append((b.title, b.status))
    return counts, seen


@router.get("", response_model=StatsOut)
def stats(days: int = Query(default=28, ge=7, le=90), user: User = Depends(current_user), db: Session = Depends(get_db)) -> StatsOut:
    now = days_api.local_now(user)
    today, minute = now.date(), now.hour * 60 + now.minute
    first = today - timedelta(days=days - 1)
    since = min(first, today - timedelta(days=STREAK_LOOKBACK_DAYS))
    stored = {
        d.date: d
        for d in db.scalars(
            select(Day).where(Day.owner_id == user.id, Day.date >= since, Day.date <= today).options(selectinload(Day.blocks))
        )
    }

    per_day: dict[date, Counts] = {}
    titles: dict[str, dict] = {}
    for on, day in stored.items():
        counts, seen = _count(day, today, minute)
        per_day[on] = counts
        if on >= first:
            for title, status in seen:
                entry = titles.setdefault(title.strip().casefold(), {"title": title.strip(), "skipped": 0, "total": 0})
                entry["total"] += 1
                entry["skipped"] += status == "skipped"

    day_list = []
    weeks: dict[date, Counts] = defaultdict(Counts)
    for i in range(days):
        on = first + timedelta(days=i)
        c = per_day.get(on, Counts())
        day_list.append(DayStats(date=on, done=c.done, skipped=c.skipped, missed=c.missed, rate=_rate(c)))
        w = weeks[on - timedelta(days=on.weekday())]
        w.done, w.skipped, w.missed = w.done + c.done, w.skipped + c.skipped, w.missed + c.missed

    streak = 0
    on = today
    while on >= since:
        c = per_day.get(on)
        rate = _rate(c) if c else None
        if rate is not None:
            if rate < GOOD_DAY:
                # Today may still turn out well: it only ends the streak once it's over.
                if on != today:
                    break
            else:
                streak += 1
        on -= timedelta(days=1)

    skipped = sorted((e for e in titles.values() if e["skipped"] >= 2), key=lambda e: (-e["skipped"], -e["total"], e["title"]))
    return StatsOut(
        days=day_list,
        weeks=[WeekStats(start=s, done=c.done, skipped=c.skipped, missed=c.missed, rate=_rate(c)) for s, c in sorted(weeks.items())],
        streak=streak,
        often_skipped=[Skipped(**e) for e in skipped[:TOP_SKIPPED]],
    )
