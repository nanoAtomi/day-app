# 0003. Calendar import from ICS addresses, fetched safely

- **Status:** accepted
- **Date:** 2026-11-10

## Context

Appointments from Outlook (often a company account), iCloud and Google should show up in the day. OAuth for three providers is heavy, and company Outlook accounts rarely allow third-party apps. All three can publish a calendar as an ICS subscription address. The address comes from a person and the server fetches it - a classic way to make a server call into its own network (SSRF), here e.g. `portal-api` or the cloud metadata address.

## Decision

- **Read-only ICS subscriptions** (`icalendar`, `recurring-ical-events`, `httpx`), no OAuth. Synced when added and every 15 minutes by the existing scheduler thread, for yesterday to two weeks ahead in the person's time zone. All-day events are left out; events over midnight are split per day.
- **Appointments are stored apart** (`calendar_events`), not as blocks of the day: a sync never creates days early (templates still apply on first opening) and never touches what was planned by hand. They are merged into the day's blocks as read-only entries (negative ids, source `calendar`).
- **Safe fetching:** https only (webcal:// becomes https://), no credentials in the address, every host - also after each redirect - must resolve to public addresses only, 15 s timeout, at most 5 MB, at most 5 redirects.
- **The address is a secret:** stored in the app's database, never sent back to the browser (only its host), never logged, not in the data export.

## Consequences

- Works with any provider that can publish ICS; a company may forbid publishing - then manual blocks stay the way.
- Changes show up with up to 15 minutes delay; "sync now" in Settings for the impatient.
- The DNS check and the connection resolve separately, so a deliberate DNS rebinding could slip through between the two; acceptable for a planner used by a few known people.
