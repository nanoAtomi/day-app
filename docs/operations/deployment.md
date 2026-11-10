# Deployment

How Day gets from a merge to https://day.nicasso.de, and the one-time setup in the portal.

## Contents

- [Release pipeline](#release-pipeline)
- [One-time setup](#one-time-setup)
- [Notifications](#notifications)
- [Installing on the phone](#installing-on-the-phone)

## Release pipeline

1. Pull request → "Build image" (`.github/workflows/build-image.yml`) runs the jobs `backend` (against PostgreSQL 17), `frontend` and `image`; the image is built but not pushed. The job `test` sums them up - the check to require before merging.
2. Merge to `main` → the same workflow pushes `ghcr.io/nanoatomi/day-app:sha-<commit>` (and `:latest`).
3. "Deploy" (`.github/workflows/deploy.yml`) starts by itself after a green build: it sends image, tag and `portal.yml` to the portal's deploy hook (`$PORTAL_URL/api/hooks/apps/day/deploy`) and waits until the portal reports `succeeded`.
4. A smoke check calls https://day.nicasso.de/privacy from outside - the run turns red if the app does not answer within 3 minutes.

**Rollback:** GitHub → Actions → **Deploy** → Run workflow with tag `sha-<older commit>`. A rollback does not undo database migrations.

## One-time setup

Done once before the first deploy (the user clicks; agents can't reach the portal admin):

1. Portal → **Admin → Apps → New app**: name `Day`, slug `day`. This creates the Keycloak group `/apps/day` and the gateway route for `day.nicasso.de`.
2. **Admin → Apps → Day → Setup**: image `ghcr.io/nanoatomi/day-app`, **Save only**, then **Create token** - copy it.
3. GitHub → `nanoAtomi/day-app` → **Settings → Secrets and variables → Actions**: `PORTAL_URL` = `https://api.nicasso.de`, `PORTAL_DEPLOY_TOKEN` = the token from step 2.
4. GitHub → **Settings → Branches**: protect `main`, require the check `test`.
5. **Admin → Users**: add the people who may use Day to `/apps/day`.
6. GitHub → Actions → **Deploy** → Run workflow once (later releases deploy themselves).

Secret variables: the Web Push keys, see [Notifications](#notifications).

## Notifications

Day pushes a notice when a block starts and, if chosen in Settings, a few minutes before. A scheduler thread in the app checks every minute ([ADR 0002](../architecture/adr/0002-web-push-and-in-process-scheduler.md)).

One-time setup:

1. Make a VAPID key pair (any machine with Python and `cryptography`):

   ```bash
   python -c "import base64;from cryptography.hazmat.primitives.asymmetric import ec;from cryptography.hazmat.primitives import serialization as s;k=ec.generate_private_key(ec.SECP256R1());b=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=').decode();print('VAPID_PUBLIC_KEY='+b(k.public_key().public_bytes(s.Encoding.X962,s.PublicFormat.UncompressedPoint)));print('VAPID_PRIVATE_KEY='+b(k.private_numbers().private_value.to_bytes(32,'big')))"
   ```

2. Portal → **Admin → Apps → Day → Setup → Variables**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (mark as secret) and `VAPID_SUBJECT` = `mailto:<your address>`.
3. Deploy once (GitHub → Actions → **Deploy** → Run workflow), so the container gets the variables.
4. In the app: **Mehr → Einstellungen → Benachrichtigungen → Auf diesem Gerät einschalten**, then "Test senden".

Changing the keys later invalidates every device's subscription - turn notifications on again per device.

## Installing on the phone

- **iPhone/iPad:** Safari → Share → **Add to Home Screen**. Notifications only reach the installed app (iOS 16.4+).
- **Android, Chrome, Edge:** "Install app" in the browser menu.
