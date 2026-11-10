from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.api import days as days_api
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")
BERLIN = ZoneInfo("Europe/Berlin")
TODAY = date(2030, 5, 15)  # a Wednesday; templates only fill days from "today" on


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """It is 12:00 on TODAY."""
    monkeypatch.setattr(days_api, "local_now", lambda user: datetime(2030, 5, 15, 12, 0, tzinfo=BERLIN))


def plan(client, on: date, *blocks, headers=ALICE):
    """blocks: (start, end, title, status)"""
    client.put(f"/api/days/{on}/template", json={"template_id": None}, headers=headers)
    for start, end, title, status in blocks:
        b = client.post(f"/api/days/{on}/blocks", json={"start_minute": start, "end_minute": end, "title": title}, headers=headers).json()
        if status != "open":
            client.patch(f"/api/blocks/{b['id']}", json={"status": status}, headers=headers)


def stats(client, headers=ALICE):
    return client.get("/api/stats?days=7", headers=headers).json()


def test_rates_per_day_and_week(client):
    plan(client, TODAY - timedelta(days=1), (420, 450, "Frühstück", "done"), (450, 480, "Sport", "skipped"), (480, 540, "Lesen", "open"), (540, 600, "Arbeit", "done"))
    # Today at noon: only blocks that are over count.
    plan(client, TODAY, (420, 450, "Frühstück", "done"), (700, 730, "Mittag", "open"), (900, 960, "Später", "open"))
    s = stats(client)
    days = {d["date"]: d for d in s["days"]}
    yesterday = days[(TODAY - timedelta(days=1)).isoformat()]
    assert (yesterday["done"], yesterday["skipped"], yesterday["missed"], yesterday["rate"]) == (2, 1, 1, 0.5)
    today = days[TODAY.isoformat()]
    assert (today["done"], today["missed"], today["rate"]) == (1, 0, 1.0)
    assert days[(TODAY - timedelta(days=3)).isoformat()]["rate"] is None
    assert len(s["days"]) == 7
    this_week = [w for w in s["weeks"] if w["start"] == "2030-05-13"][0]  # Monday
    assert (this_week["done"], this_week["skipped"], this_week["missed"], this_week["rate"]) == (3, 1, 1, 0.6)


def test_streak_skips_free_days_and_stops_at_a_bad_one(client):
    good = [(420, 450, "Frühstück", "done"), (450, 480, "Bad", "done")]
    plan(client, TODAY - timedelta(days=5), (420, 450, "Frühstück", "skipped"))  # bad
    plan(client, TODAY - timedelta(days=4), *good)
    plan(client, TODAY - timedelta(days=3), *good)
    # TODAY - 2: nothing planned - doesn't break it
    plan(client, TODAY - timedelta(days=1), (420, 450, "Frühstück", "done"), (450, 480, "Bad", "done"), (480, 540, "Weg", "skipped"), (540, 600, "Arbeit", "done"), (600, 660, "X", "done"))  # 80 %
    plan(client, TODAY, (420, 450, "Frühstück", "open"))  # today not good yet: no break
    assert stats(client)["streak"] == 3


def test_often_skipped(client):
    for i in range(1, 4):
        plan(client, TODAY - timedelta(days=i), (420, 450, "Sport", "skipped" if i < 3 else "done"), (450, 480, "Lesen", "skipped" if i == 1 else "done"))
    assert stats(client)["often_skipped"] == [{"title": "Sport", "skipped": 2, "total": 3}]


def test_only_your_own_days_count(client):
    plan(client, TODAY - timedelta(days=1), (420, 450, "Sport", "skipped"), headers=BOB)
    s = stats(client)
    assert all(d["rate"] is None for d in s["days"]) and s["streak"] == 0
    assert client.get("/api/stats?days=200", headers=ALICE).status_code == 422
