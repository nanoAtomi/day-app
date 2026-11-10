# 0002. Web Push from an in-process scheduler

- **Status:** accepted
- **Date:** 2026-11-10

## Context

Day should tell people when a block starts, and optionally a few minutes before, on the phone too - also when the app is closed. The platform runs one container per app and offers no job runner.

## Decision

- **Web Push with VAPID** (`pywebpush`), like the Todo app: each device registers a subscription; the keys are portal secret variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Without keys the app runs and notifications are off.
- **A scheduler thread inside the app** (`app/notify.py`) checks every minute: for each person with a device, today's open blocks in their time zone. A `notification_log` row per notification (key: date, block, its start, kind) makes each go out once - also across restarts - and announces a moved block again. Notifications more than 10 minutes late (after downtime) are dropped.

## Consequences

- No extra container or external service besides the browsers' push services.
- One app instance per deployment is assumed; two instances would only send duplicates, which the unique log key prevents.
- iPhones get notifications only for the app added to the home screen (iOS 16.4+).
