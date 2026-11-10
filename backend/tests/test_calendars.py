from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest

from app import calendar_sync, notify
from app.calendar_sync import CalendarError, check_public_host, fetch_ics, normalize_url, parse_events
from tests.conftest import as_user
from tests.test_push import sent, subscribe  # noqa: F401 - the fixture

ALICE = as_user("alice")
BOB = as_user("bob")
BERLIN = ZoneInfo("Europe/Berlin")


def ics(*events: str) -> bytes:
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n" + "".join(events) + "END:VCALENDAR\r\n").encode()


def event(uid: str, summary: str, start: str, end: str, extra: str = "") -> str:
    return f"BEGIN:VEVENT\r\nUID:{uid}\r\nSUMMARY:{summary}\r\nDTSTART{start}\r\nDTEND{end}\r\n{extra}END:VEVENT\r\n"


# ------------------------------------------------------------- fetching safely

def test_addresses_must_be_https():
    assert normalize_url("webcal://p01-caldav.icloud.com/published/2/abc") == "https://p01-caldav.icloud.com/published/2/abc"
    for bad in ("http://calendar.example/x.ics", "ftp://calendar.example/x", "https://user:pw@calendar.example/x.ics", "not a url"):
        with pytest.raises(CalendarError):
            normalize_url(bad)


@pytest.mark.parametrize("host", ["127.0.0.1", "10.1.2.3", "192.168.0.10", "169.254.169.254", "::1", "localhost"])
def test_internal_hosts_are_refused(host):
    with pytest.raises(CalendarError) as e:
        check_public_host(host, 443)
    assert str(e.value) == "forbidden"


def test_redirects_into_the_network_are_refused(monkeypatch):
    monkeypatch.setattr(calendar_sync, "check_public_host", lambda host, port: (_ for _ in ()).throw(CalendarError("forbidden")) if host == "127.0.0.1" else None)
    redirect = httpx.MockTransport(lambda request: httpx.Response(302, headers={"location": "https://127.0.0.1/admin"}))
    with pytest.raises(CalendarError, match="forbidden"):
        fetch_ics("https://calendar.example/x.ics", transport=redirect)
    to_http = httpx.MockTransport(lambda request: httpx.Response(301, headers={"location": "http://calendar.example/x.ics"}))
    with pytest.raises(CalendarError, match="scheme"):
        fetch_ics("https://calendar.example/x.ics", transport=to_http)


def test_errors_and_size_limit(monkeypatch):
    monkeypatch.setattr(calendar_sync, "check_public_host", lambda host, port: None)
    with pytest.raises(CalendarError, match="http:404"):
        fetch_ics("https://calendar.example/x.ics", transport=httpx.MockTransport(lambda r: httpx.Response(404)))
    huge = httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * (calendar_sync.MAX_BYTES + 1)))
    with pytest.raises(CalendarError, match="too_big"):
        fetch_ics("https://calendar.example/x.ics", transport=huge)
    ok = httpx.MockTransport(lambda r: httpx.Response(200, content=ics()))
    assert fetch_ics("https://calendar.example/x.ics", transport=ok).startswith(b"BEGIN:VCALENDAR")


# ------------------------------------------------------------- reading events

def test_parse_times_all_day_recurring_and_overnight():
    data = ics(
        event("a", "Zahnarzt", ":20261112T090000Z", ":20261112T100000Z"),  # UTC -> 10:00 Berlin
        event("b", "Feiertag", ";VALUE=DATE:20261112", ";VALUE=DATE:20261113"),  # all-day: left out
        event("c", "Jour fixe", ";TZID=Europe/Berlin:20261109T143000", ";TZID=Europe/Berlin:20261109T150000", "RRULE:FREQ=WEEKLY\r\n"),
        event("d", "Nachtzug", ":20261112T220000", ":20261113T063000"),  # floating, over midnight
    )
    events = parse_events(data, BERLIN, date(2026, 11, 10), date(2026, 11, 17))
    found = sorted((e["date"].isoformat(), e["start_minute"], e["end_minute"], e["title"]) for e in events)
    assert found == [
        ("2026-11-12", 600, 660, "Zahnarzt"),
        ("2026-11-12", 1320, 1440, "Nachtzug"),
        ("2026-11-13", 0, 390, "Nachtzug"),
        ("2026-11-16", 870, 900, "Jour fixe"),
    ]
    with pytest.raises(CalendarError, match="not_ics"):
        parse_events(b"<html>nope</html>", BERLIN, date(2026, 11, 10), date(2026, 11, 17))


# ------------------------------------------------------------- the API

def today() -> date:
    return datetime.now(BERLIN).date()


@pytest.fixture()
def feed(monkeypatch):
    """The calendar file every address returns (no network)."""
    holder = {"ics": b""}

    def fake_fetch(url):
        normalize_url(url)
        return holder["ics"]

    monkeypatch.setattr(calendar_sync, "fetch_ics", fake_fetch)
    t = today().strftime("%Y%m%d")
    holder["ics"] = ics(event("m1", "Team-Meeting", f";TZID=Europe/Berlin:{t}T180000", f";TZID=Europe/Berlin:{t}T183000"))
    return holder


def test_add_list_show_and_delete(client, feed):
    created = client.post("/api/calendars", json={"name": "Arbeit", "url": "webcal://outlook.example/owa/calendar/secret-token/calendar.ics", "color": "blue"}, headers=ALICE)
    assert created.status_code == 201
    body = created.json()
    assert (body["name"], body["host"], body["events"], body["last_error"]) == ("Arbeit", "outlook.example", 1, None)
    assert "secret-token" not in str(client.get("/api/calendars", headers=ALICE).json())

    blocks = client.get(f"/api/days/{today()}", headers=ALICE).json()["blocks"]
    meeting = [b for b in blocks if b["source"] == "calendar"]
    assert [(b["title"], b["start_minute"], b["calendar"], b["color"]) for b in meeting] == [("Team-Meeting", 1080, "Arbeit", "blue")]
    # Read-only: it is no block of the day.
    assert client.patch(f"/api/blocks/{meeting[0]['id']}", json={"title": "x"}, headers=ALICE).status_code == 404
    # The week shows it on days not opened yet too.
    week = client.get(f"/api/days?from={today()}&days=1", headers=ALICE).json()
    assert any(b["title"] == "Team-Meeting" for b in week[0]["blocks"])

    assert client.delete(f"/api/calendars/{body['id']}", headers=ALICE).status_code == 204
    assert all(b["source"] != "calendar" for b in client.get(f"/api/days/{today()}", headers=ALICE).json()["blocks"])


def test_unreadable_address_is_refused(client, feed):
    feed["ics"] = b"<html>Anmelden</html>"
    response = client.post("/api/calendars", json={"name": "Kaputt", "url": "https://calendar.example/x.ics"}, headers=ALICE)
    assert (response.status_code, response.json()["detail"]) == (422, {"code": "not_ics"})
    assert client.get("/api/calendars", headers=ALICE).json() == []
    response = client.post("/api/calendars", json={"name": "Unsicher", "url": "http://calendar.example/x.ics"}, headers=ALICE)
    assert response.json()["detail"] == {"code": "scheme"}


def test_resync_replaces_events_and_records_errors(client, feed):
    source = client.post("/api/calendars", json={"name": "Privat", "url": "https://calendar.example/x.ics"}, headers=ALICE).json()
    t = today().strftime("%Y%m%d")
    feed["ics"] = ics(event("m2", "Yoga", f";TZID=Europe/Berlin:{t}T190000", f";TZID=Europe/Berlin:{t}T200000"))
    synced = client.post(f"/api/calendars/{source['id']}/sync", headers=ALICE).json()
    assert synced["events"] == 1
    titles = [b["title"] for b in client.get(f"/api/days/{today()}", headers=ALICE).json()["blocks"] if b["source"] == "calendar"]
    assert titles == ["Yoga"]
    feed["ics"] = b"broken"
    assert client.post(f"/api/calendars/{source['id']}/sync", headers=ALICE).json()["last_error"] == "not_ics"


def test_calendars_are_private(client, feed):
    source = client.post("/api/calendars", json={"name": "Arbeit", "url": "https://calendar.example/x.ics"}, headers=ALICE).json()
    assert client.get("/api/calendars", headers=BOB).json() == []
    assert all(b["source"] != "calendar" for b in client.get(f"/api/days/{today()}", headers=BOB).json()["blocks"])
    assert client.patch(f"/api/calendars/{source['id']}", json={"name": "Bob"}, headers=BOB).status_code == 404
    assert client.post(f"/api/calendars/{source['id']}/sync", headers=BOB).status_code == 404
    assert client.delete(f"/api/calendars/{source['id']}", headers=BOB).status_code == 404
    export = client.get("/api/platform/users/alice/export", headers={"X-Portal-Secret": "test-secret"}).json()
    assert export["calendars"] == ["Arbeit"] and "calendar.example" not in str(export)


def test_appointments_are_announced_once_across_syncs(client, feed, sent):  # noqa: F811
    subscribe(client, ALICE, "phone")
    client.put(f"/api/days/{today()}/template", json={"template_id": None}, headers=ALICE)
    source = client.post("/api/calendars", json={"name": "Arbeit", "url": "https://calendar.example/x.ics"}, headers=ALICE).json()
    at = datetime.combine(today(), datetime.min.time(), BERLIN) + timedelta(hours=18)
    notify.run_once(at)
    client.post(f"/api/calendars/{source['id']}/sync", headers=ALICE)  # stores the events anew
    notify.run_once(at + timedelta(minutes=1))
    assert [p["title"] for _, p in sent] == ["Jetzt: Team-Meeting"]
