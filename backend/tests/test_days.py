from app.db import SessionLocal
from app.models import Block
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")
# A past day starts empty (no template) - these tests are about blocks themselves.
DAY = "2020-01-07"


def add(client, start, end, title="Arbeit", category="work", headers=ALICE, on=DAY):
    return client.post(f"/api/days/{on}/blocks", json={"start_minute": start, "end_minute": end, "title": title, "category": category}, headers=headers)


def test_new_past_day_is_empty_with_the_users_delay_mode(client):
    day = client.get(f"/api/days/{DAY}", headers=ALICE).json()
    assert day == {"date": DAY, "stored": True, "template_id": None, "delay_mode": "fixed", "delay_mode_override": None, "blocks": []}


def test_blocks_come_sorted_by_start(client):
    add(client, 540, 1020, "Arbeit")
    add(client, 420, 450, "Frühstück", "meal")
    blocks = client.get(f"/api/days/{DAY}", headers=ALICE).json()["blocks"]
    assert [(b["title"], b["start_minute"], b["source"], b["status"]) for b in blocks] == [
        ("Frühstück", 420, "manual", "open"),
        ("Arbeit", 540, "manual", "open"),
    ]


def test_block_validation(client):
    assert add(client, 600, 600).status_code == 422  # zero length
    assert add(client, 600, 602).status_code == 422  # shorter than 5 minutes
    assert add(client, 1400, 1500).status_code == 422  # past midnight
    assert add(client, 540, 600, category="nap").status_code == 422
    assert add(client, 540, 600, title="").status_code == 422
    assert client.get("/api/days/2026-13-01", headers=ALICE).status_code == 422


def test_update_move_and_status(client):
    block = add(client, 540, 600).json()
    moved = client.patch(f"/api/blocks/{block['id']}", json={"start_minute": 555, "end_minute": 615, "title": " Meeting "}, headers=ALICE).json()
    assert (moved["start_minute"], moved["end_minute"], moved["title"]) == (555, 615, "Meeting")
    # +15 min: only the end moves.
    assert client.patch(f"/api/blocks/{block['id']}", json={"end_minute": 630}, headers=ALICE).json()["end_minute"] == 630
    assert client.patch(f"/api/blocks/{block['id']}", json={"end_minute": 556}, headers=ALICE).status_code == 422

    done = client.patch(f"/api/blocks/{block['id']}", json={"status": "done"}, headers=ALICE).json()
    assert done["status"] == "done" and done["actual_end"] is not None
    reopened = client.patch(f"/api/blocks/{block['id']}", json={"status": "open"}, headers=ALICE).json()
    assert reopened["status"] == "open" and reopened["actual_end"] is None
    assert client.patch(f"/api/blocks/{block['id']}", json={"status": "later"}, headers=ALICE).status_code == 422


def test_delete(client):
    block = add(client, 540, 600).json()
    assert client.delete(f"/api/blocks/{block['id']}", headers=ALICE).status_code == 204
    assert client.get(f"/api/days/{DAY}", headers=ALICE).json()["blocks"] == []
    assert client.delete(f"/api/blocks/{block['id']}", headers=ALICE).status_code == 404


def test_calendar_blocks_are_read_only(client):
    block = add(client, 600, 660, "Termin").json()
    with SessionLocal() as db:
        db.get(Block, block["id"]).source = "calendar"
        db.commit()
    assert client.patch(f"/api/blocks/{block['id']}", json={"title": "Anders"}, headers=ALICE).status_code == 409
    assert client.patch(f"/api/blocks/{block['id']}", json={"end_minute": 700}, headers=ALICE).status_code == 409
    assert client.delete(f"/api/blocks/{block['id']}", headers=ALICE).status_code == 409
    # Ticking it off is fine.
    assert client.patch(f"/api/blocks/{block['id']}", json={"status": "done"}, headers=ALICE).status_code == 200


def test_people_never_see_or_change_each_others_days(client):
    block = add(client, 540, 600, "Alices Block").json()
    assert client.get(f"/api/days/{DAY}", headers=BOB).json()["blocks"] == []
    assert client.patch(f"/api/blocks/{block['id']}", json={"title": "Bob war hier"}, headers=BOB).status_code == 404
    assert client.patch(f"/api/blocks/{block['id']}", json={"status": "done"}, headers=BOB).status_code == 404
    assert client.delete(f"/api/blocks/{block['id']}", headers=BOB).status_code == 404
    assert client.get(f"/api/days/{DAY}", headers=ALICE).json()["blocks"][0]["title"] == "Alices Block"
