from tests.conftest import as_user

PORTAL = {"X-Portal-Secret": "test-secret"}


def test_needs_the_portal_secret(client):
    assert client.get("/api/platform/users/alice/export").status_code == 403
    assert client.get("/api/platform/users/alice/export", headers={"X-Portal-Secret": "wrong"}).status_code == 403
    # The gateway's headers are not enough.
    assert client.get("/api/platform/users/alice/export", headers=as_user("alice")).status_code == 403


def test_export_unknown_person_is_empty(client):
    assert client.get("/api/platform/users/nobody/export", headers=PORTAL).json() == {}
    assert client.delete("/api/platform/users/nobody", headers=PORTAL).status_code == 204


def test_export_and_delete_only_touch_that_person(client):
    alice, bob = as_user("alice", "alice@example.com"), as_user("bob")
    client.post("/api/days/2026-11-10/blocks", json={"start_minute": 420, "end_minute": 450, "title": "Frühstück", "category": "meal"}, headers=alice)
    client.post("/api/days/2026-11-10/blocks", json={"start_minute": 540, "end_minute": 600, "title": "Bobs Block"}, headers=bob)
    client.get("/api/days/2026-11-11", headers=alice)  # an empty day is not exported

    data = client.get("/api/platform/users/alice/export", headers=PORTAL).json()
    assert data["user"]["email"] == "alice@example.com"
    assert data["days"] == [{
        "date": "2026-11-10", "template": None, "delay_mode": None,
        "blocks": [{"start": "07:00", "end": "07:30", "title": "Frühstück", "category": "meal",
                    "source": "manual", "status": "open", "subtasks": []}],
    }]
    assert "Bobs Block" not in str(data)

    assert client.delete("/api/platform/users/alice", headers=PORTAL).status_code == 204
    assert client.get("/api/platform/users/alice/export", headers=PORTAL).json() == {}
    assert client.get("/api/days/2026-11-10", headers=bob).json()["blocks"][0]["title"] == "Bobs Block"
