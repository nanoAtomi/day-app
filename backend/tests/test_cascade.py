from datetime import datetime
from zoneinfo import ZoneInfo

from app.api import days as days_api
from tests.conftest import as_user

ALICE = as_user("alice")
DAY = "2020-01-07"


def plan(client, *blocks, on=DAY):
    ids = []
    for start, end, title in blocks:
        ids.append(client.post(f"/api/days/{on}/blocks", json={"start_minute": start, "end_minute": end, "title": title}, headers=ALICE).json()["id"])
    return ids


def times(client, on=DAY):
    return [(b["title"], b["start_minute"], b["end_minute"]) for b in client.get(f"/api/days/{on}", headers=ALICE).json()["blocks"]]


def cascade(client, on=DAY):
    assert client.patch(f"/api/days/{on}", json={"delay_mode": "cascade"}, headers=ALICE).json()["delay_mode"] == "cascade"


def test_fixed_mode_leaves_the_rest_alone(client):
    breakfast, _ = plan(client, (420, 450, "Frühstück"), (450, 480, "Bad"))
    client.patch(f"/api/blocks/{breakfast}", json={"end_minute": 465}, headers=ALICE)
    assert times(client) == [("Frühstück", 420, 465), ("Bad", 450, 480)]


def test_running_over_pushes_the_following_blocks_until_a_gap(client):
    breakfast, *_ = plan(client, (420, 450, "Frühstück"), (450, 480, "Bad"), (480, 540, "Weg"), (600, 660, "Meeting"))
    cascade(client)
    client.patch(f"/api/blocks/{breakfast}", json={"end_minute": 465}, headers=ALICE)  # +15 min
    # Bad and Weg move 15 minutes; the hour before the meeting absorbs the rest.
    assert times(client) == [("Frühstück", 420, 465), ("Bad", 465, 495), ("Weg", 495, 555), ("Meeting", 600, 660)]


def test_done_and_calendar_blocks_stay(client):
    breakfast, bath, call = plan(client, (420, 450, "Frühstück"), (450, 480, "Bad"), (450, 470, "Anruf"))
    from app.db import SessionLocal
    from app.models import Block

    with SessionLocal() as db:
        db.get(Block, call).source = "calendar"
        db.commit()
    client.patch(f"/api/blocks/{bath}", json={"status": "done"}, headers=ALICE)
    cascade(client)
    client.patch(f"/api/blocks/{breakfast}", json={"end_minute": 480}, headers=ALICE)
    assert times(client) == [("Frühstück", 420, 480), ("Bad", 450, 480), ("Anruf", 450, 470)]


def test_nothing_runs_past_midnight(client):
    evening, _ = plan(client, (1320, 1380, "Film"), (1380, 1435, "Lesen"))
    cascade(client)
    client.patch(f"/api/blocks/{evening}", json={"end_minute": 1440}, headers=ALICE)
    assert times(client) == [("Film", 1320, 1440), ("Lesen", 1435, 1440)]


def test_moving_a_block_is_not_running_over(client):
    breakfast, _ = plan(client, (420, 450, "Frühstück"), (450, 480, "Bad"))
    cascade(client)
    client.patch(f"/api/blocks/{breakfast}", json={"start_minute": 435, "end_minute": 465}, headers=ALICE)
    assert times(client) == [("Frühstück", 435, 465), ("Bad", 450, 480)]


def test_done_late_today_moves_the_rest_from_now(client, monkeypatch):
    today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
    monkeypatch.setattr(days_api, "local_now", lambda user: datetime.fromisoformat(f"{today}T07:40:00+01:00"))
    client.get("/api/me", headers=ALICE)
    # Start from an empty day (no template).
    day = client.put(f"/api/days/{today}/template", json={"template_id": None}, headers=ALICE).json()
    assert day["blocks"] == []
    breakfast, _ = plan(client, (420, 430, "Frühstück"), (430, 460, "Bad"), on=today)
    cascade(client, on=today)
    client.patch(f"/api/blocks/{breakfast}", json={"status": "done"}, headers=ALICE)
    assert times(client, on=today) == [("Frühstück", 420, 430), ("Bad", 460, 490)]


def test_day_mode_falls_back_to_the_users_default(client):
    client.patch("/api/me", json={"delay_mode": "cascade"}, headers=ALICE)
    assert client.get(f"/api/days/{DAY}", headers=ALICE).json()["delay_mode"] == "cascade"
    day = client.patch(f"/api/days/{DAY}", json={"delay_mode": "fixed"}, headers=ALICE).json()
    assert (day["delay_mode"], day["delay_mode_override"]) == ("fixed", "fixed")
    day = client.patch(f"/api/days/{DAY}", json={"delay_mode": None}, headers=ALICE).json()
    assert (day["delay_mode"], day["delay_mode_override"]) == ("cascade", None)
    assert client.patch(f"/api/days/{DAY}", json={"delay_mode": "sometimes"}, headers=ALICE).status_code == 422
