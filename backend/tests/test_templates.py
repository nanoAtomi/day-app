from datetime import date, timedelta

from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")


def next_weekday(weekday: int) -> str:
    """A date in the future (templates apply from today on) on the given weekday."""
    d = date.today() + timedelta(days=14)
    return (d + timedelta(days=(weekday - d.weekday()) % 7)).isoformat()


def templates(client, headers=ALICE):
    return {t["name"]: t for t in client.get("/api/templates", headers=headers).json()}


def test_starter_templates_once(client):
    seeded = templates(client)
    assert list(seeded) == ["Bürotag", "Homeoffice", "Wochenende", "Training"]
    office = seeded["Bürotag"]
    assert office["kind"] == "day" and office["weekdays"] == [0, 1, 2, 3, 4]
    assert [(b["start_minute"], b["duration_minutes"], b["title"]) for b in office["blocks"]][:3] == [(420, 30, "Frühstück"), (450, 30, "Bad/Anziehen"), (480, 60, "Arbeitsweg")]
    assert seeded["Wochenende"]["weekdays"] == [5, 6]
    assert seeded["Training"]["kind"] == "module"
    # Deleted starter templates stay deleted.
    for t in seeded.values():
        assert client.delete(f"/api/templates/{t['id']}", headers=ALICE).status_code == 204
    assert client.get("/api/templates", headers=ALICE).json() == []


def test_future_day_is_a_copy_of_its_weekday_template(client):
    monday = next_weekday(0)
    day = client.get(f"/api/days/{monday}", headers=ALICE).json()
    office = templates(client)["Bürotag"]
    assert day["template_id"] == office["id"]
    assert [b["title"] for b in day["blocks"]][:2] == ["Frühstück", "Bad/Anziehen"]
    assert {b["source"] for b in day["blocks"]} == {"template"}

    # Changing the day leaves the template alone ...
    first = day["blocks"][0]
    client.patch(f"/api/blocks/{first['id']}", json={"title": "Müsli"}, headers=ALICE)
    assert templates(client)["Bürotag"]["blocks"][0]["title"] == "Frühstück"
    # ... and changing the template leaves the day alone.
    client.patch(f"/api/template-blocks/{office['blocks'][0]['id']}", json={"title": "Croissant"}, headers=ALICE)
    assert client.get(f"/api/days/{monday}", headers=ALICE).json()["blocks"][0]["title"] == "Müsli"


def test_past_days_start_empty(client):
    templates(client)
    assert client.get("/api/days/2020-01-06", headers=ALICE).json()["blocks"] == []  # a Monday


def test_week_previews_without_storing(client):
    monday = next_weekday(0)
    week = client.get(f"/api/days?from={monday}&days=7", headers=ALICE).json()
    assert [d["stored"] for d in week] == [False] * 7
    assert week[0]["blocks"][0]["title"] == "Frühstück"
    assert week[5]["blocks"][0]["start_minute"] == 9 * 60  # weekend
    # A template change before the day is opened still counts.
    office = templates(client)["Bürotag"]
    client.patch(f"/api/template-blocks/{office['blocks'][0]['id']}", json={"title": "Croissant"}, headers=ALICE)
    assert client.get(f"/api/days/{monday}", headers=ALICE).json()["blocks"][0]["title"] == "Croissant"
    assert client.get(f"/api/days?from={monday}&days=1", headers=ALICE).json()[0]["stored"] is True
    assert client.get(f"/api/days?from={monday}&days=15", headers=ALICE).status_code == 422


def test_switching_a_days_template_keeps_own_blocks(client):
    monday = next_weekday(0)
    client.get(f"/api/days/{monday}", headers=ALICE)
    client.post(f"/api/days/{monday}/blocks", json={"start_minute": 1200, "end_minute": 1260, "title": "Anruf Oma"}, headers=ALICE)
    home = templates(client)["Homeoffice"]
    day = client.put(f"/api/days/{monday}/template", json={"template_id": home["id"]}, headers=ALICE).json()
    assert day["template_id"] == home["id"]
    titles = [b["title"] for b in day["blocks"]]
    assert "Mittagspause" in titles and "Arbeitsweg" not in titles and "Anruf Oma" in titles

    empty = client.put(f"/api/days/{monday}/template", json={"template_id": None}, headers=ALICE).json()
    assert [b["title"] for b in empty["blocks"]] == ["Anruf Oma"]
    training = templates(client)["Training"]
    assert client.put(f"/api/days/{monday}/template", json={"template_id": training["id"]}, headers=ALICE).status_code == 422


def test_insert_module_at_a_time(client):
    training = templates(client)["Training"]
    day = client.post("/api/days/2020-01-07/modules", json={"template_id": training["id"], "start_minute": 7 * 60}, headers=ALICE).json()
    blocks = [(b["start_minute"], b["end_minute"], b["title"], b["source"]) for b in day["blocks"]]
    assert blocks == [(420, 435, "Anfahrt", "manual"), (435, 510, "Training", "manual"), (510, 525, "Duschen", "manual")]
    assert [s["title"] for s in day["blocks"][1]["subtasks"]] == ["Aufwärmen", "Kraft", "Dehnen"]
    assert client.post("/api/days/2020-01-07/modules", json={"template_id": training["id"], "start_minute": 23 * 60}, headers=ALICE).status_code == 422
    office = templates(client)["Bürotag"]
    assert client.post("/api/days/2020-01-07/modules", json={"template_id": office["id"], "start_minute": 420}, headers=ALICE).status_code == 422


def test_edit_templates_and_weekdays(client):
    created = client.post("/api/templates", json={"name": " Urlaub ", "icon": "🏖️", "color": "teal"}, headers=ALICE).json()
    assert (created["name"], created["kind"], created["blocks"]) == ("Urlaub", "day", [])
    t = client.post(f"/api/templates/{created['id']}/blocks", json={"start_minute": 600, "duration_minutes": 120, "title": "Strand", "category": "leisure", "subtasks": [" Sonnencreme ", ""]}, headers=ALICE).json()
    block = t["blocks"][0]
    assert block["subtasks"] == ["Sonnencreme"]
    assert client.post(f"/api/templates/{created['id']}/blocks", json={"start_minute": 1400, "duration_minutes": 60, "title": "Zu spät"}, headers=ALICE).status_code == 422
    assert client.patch(f"/api/template-blocks/{block['id']}", json={"duration_minutes": 90}, headers=ALICE).json()["blocks"][0]["duration_minutes"] == 90
    assert client.patch(f"/api/templates/{created['id']}", json={"name": "Ferien", "color": "pink"}, headers=ALICE).status_code == 422

    assert client.put(f"/api/weekdays/4", json={"template_id": created["id"]}, headers=ALICE).status_code == 204
    assert templates(client)["Urlaub"]["weekdays"] == [4]
    assert templates(client)["Bürotag"]["weekdays"] == [0, 1, 2, 3]
    assert client.put("/api/weekdays/4", json={"template_id": None}, headers=ALICE).status_code == 204
    assert client.put("/api/weekdays/7", json={"template_id": None}, headers=ALICE).status_code == 422

    assert client.delete(f"/api/template-blocks/{block['id']}", headers=ALICE).json()["blocks"] == []


def test_templates_are_private(client):
    alice = templates(client)
    office = alice["Bürotag"]
    templates(client, BOB)  # Bob has his own starters
    assert client.get(f"/api/templates/{office['id']}", headers=BOB).status_code == 404
    assert client.patch(f"/api/templates/{office['id']}", json={"name": "Bobs"}, headers=BOB).status_code == 404
    assert client.delete(f"/api/templates/{office['id']}", headers=BOB).status_code == 404
    assert client.patch(f"/api/template-blocks/{office['blocks'][0]['id']}", json={"title": "x"}, headers=BOB).status_code == 404
    assert client.post(f"/api/templates/{office['id']}/blocks", json={"start_minute": 0, "duration_minutes": 30, "title": "x"}, headers=BOB).status_code == 404
    assert client.put("/api/weekdays/0", json={"template_id": office["id"]}, headers=BOB).status_code == 404
    assert client.put(f"/api/days/{next_weekday(0)}/template", json={"template_id": office["id"]}, headers=BOB).status_code == 404
    assert client.post("/api/days/2020-01-07/modules", json={"template_id": alice["Training"]["id"], "start_minute": 420}, headers=BOB).status_code == 404
    assert templates(client)["Bürotag"]["name"] == "Bürotag"
