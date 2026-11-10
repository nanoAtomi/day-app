from dataclasses import replace
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app import notify, push
from app.api import push as push_api
from app.config import settings
from tests.conftest import as_user

ALICE = as_user("alice", "alice@example.com")
BOB = as_user("bob")
BERLIN = ZoneInfo("Europe/Berlin")


@pytest.fixture()
def sent(monkeypatch):
    """Push on with fake keys; deliveries are recorded instead of sent."""
    enabled = replace(settings, vapid_public_key="BPublicKey", vapid_private_key="private")
    monkeypatch.setattr(push, "settings", enabled)
    monkeypatch.setattr(push_api, "settings", enabled)
    records: list[tuple[str, dict]] = []
    monkeypatch.setattr(push, "deliver_payload", lambda sub, payload: records.append((sub.endpoint, payload)))
    return records


def subscribe(client, headers, name, language="de"):
    response = client.post("/api/push/subscriptions", json={"endpoint": f"https://push.example/{name}", "keys": {"p256dh": "p", "auth": "a"}, "language": language}, headers=headers)
    assert response.status_code == 201


def plan_today(client, headers=ALICE):
    """Today without a template and one block from 18:00 to 19:30."""
    today = datetime.now(BERLIN).date().isoformat()
    client.put(f"/api/days/{today}/template", json={"template_id": None}, headers=headers)
    block = client.post(f"/api/days/{today}/blocks", json={"start_minute": 1080, "end_minute": 1170, "title": "Training", "category": "sport"}, headers=headers).json()
    return today, block


def at(today: str, hhmm: str) -> datetime:
    return datetime.fromisoformat(f"{today}T{hhmm}:00").replace(tzinfo=BERLIN)


def test_config_subscribe_test_and_unsubscribe(client, sent):
    assert client.get("/api/push/config", headers=ALICE).json() == {"enabled": True, "public_key": "BPublicKey", "devices": 0}
    subscribe(client, ALICE, "phone")
    assert client.get("/api/push/config", headers=ALICE).json()["devices"] == 1
    assert client.post("/api/push/test", headers=ALICE).json() == {"sent": 1}
    assert sent[0][1]["title"] == "Benachrichtigungen funktionieren ✓"
    client.post("/api/push/unsubscribe", json={"endpoint": "https://push.example/phone"}, headers=ALICE)
    assert client.post("/api/push/test", headers=ALICE).json() == {"sent": 0}
    assert client.post("/api/push/subscriptions", json={"endpoint": "http://insecure.example/x", "keys": {"p256dh": "p", "auth": "a"}}, headers=ALICE).status_code == 422


def test_without_keys_push_is_off(client):
    assert client.get("/api/push/config", headers=ALICE).json()["enabled"] is False
    assert client.post("/api/push/test", headers=ALICE).status_code == 503


def test_start_and_advance_notice_once(client, sent):
    subscribe(client, ALICE, "phone")
    client.patch("/api/me", json={"notify_lead_minutes": 10}, headers=ALICE)
    today, _ = plan_today(client)

    assert notify.run_once(at(today, "17:45")) == 0
    assert notify.run_once(at(today, "17:50")) == 1
    assert sent[-1][1]["title"] == "In 10 min: Training"
    assert notify.run_once(at(today, "17:51")) == 0  # only once
    assert notify.run_once(at(today, "18:00")) == 1
    assert (sent[-1][1]["title"], sent[-1][1]["body"]) == ("Jetzt: Training", "bis 19:30")
    assert notify.run_once(at(today, "18:05")) == 0


def test_moved_block_is_announced_again_done_ones_not(client, sent):
    subscribe(client, ALICE, "phone", language="en")
    today, block = plan_today(client)
    assert notify.run_once(at(today, "18:00")) == 1
    assert sent[-1][1]["title"] == "Now: Training"
    client.patch(f"/api/blocks/{block['id']}", json={"start_minute": 1110, "end_minute": 1200}, headers=ALICE)
    assert notify.run_once(at(today, "18:30")) == 1
    client.patch(f"/api/blocks/{block['id']}", json={"start_minute": 1140, "end_minute": 1230, "status": "done"}, headers=ALICE)
    assert notify.run_once(at(today, "19:00")) == 0


def test_late_and_switched_off(client, sent):
    subscribe(client, ALICE, "phone")
    today, _ = plan_today(client)
    # After downtime: more than 10 minutes late is dropped.
    assert notify.run_once(at(today, "18:15")) == 0
    client.patch("/api/me", json={"notify_start": False}, headers=ALICE)
    assert client.get("/api/me", headers=ALICE).json()["notify_start"] is False


def test_only_your_own_blocks_reach_your_devices(client, sent):
    subscribe(client, ALICE, "alice-phone")
    subscribe(client, BOB, "bob-phone")
    today, _ = plan_today(client, ALICE)
    client.put(f"/api/days/{today}/template", json={"template_id": None}, headers=BOB)
    notify.run_once(at(today, "18:00"))
    assert [endpoint for endpoint, _ in sent] == ["https://push.example/alice-phone"]
