from app.db import SessionLocal
from app.models import Block
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")
DAY = "2020-01-07"


def block(client, headers=ALICE):
    return client.post(f"/api/days/{DAY}/blocks", json={"start_minute": 1080, "end_minute": 1170, "title": "Training", "category": "sport"}, headers=headers).json()


def subtasks(client, headers=ALICE):
    return [(s["title"], s["done"]) for s in client.get(f"/api/days/{DAY}", headers=headers).json()["blocks"][0]["subtasks"]]


def test_add_tick_rename_delete(client):
    b = block(client)
    warm = client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": " Aufwärmen "}, headers=ALICE).json()
    client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": "Kraft"}, headers=ALICE)
    assert subtasks(client) == [("Aufwärmen", False), ("Kraft", False)]

    assert client.patch(f"/api/subtasks/{warm['id']}", json={"done": True}, headers=ALICE).json()["done"] is True
    client.patch(f"/api/subtasks/{warm['id']}", json={"title": "Warm up"}, headers=ALICE)
    assert subtasks(client) == [("Warm up", True), ("Kraft", False)]

    assert client.delete(f"/api/subtasks/{warm['id']}", headers=ALICE).status_code == 204
    assert subtasks(client) == [("Kraft", False)]
    assert client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": ""}, headers=ALICE).status_code == 422


def test_calendar_blocks_get_no_subtasks(client):
    b = block(client)
    with SessionLocal() as db:
        db.get(Block, b["id"]).source = "calendar"
        db.commit()
    assert client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": "x"}, headers=ALICE).status_code == 409


def test_subtasks_are_private(client):
    b = block(client)
    s = client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": "Kraft"}, headers=ALICE).json()
    assert client.post(f"/api/blocks/{b['id']}/subtasks", json={"title": "Bob"}, headers=BOB).status_code == 404
    assert client.patch(f"/api/subtasks/{s['id']}", json={"done": True}, headers=BOB).status_code == 404
    assert client.delete(f"/api/subtasks/{s['id']}", headers=BOB).status_code == 404
    assert subtasks(client) == [("Kraft", False)]
