# Deployment

How Day gets from a merge to https://day.nicasso.de, and the one-time setup in the portal.

## Contents

- [Release pipeline](#release-pipeline)
- [One-time setup](#one-time-setup)
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

Day needs no secret variables yet. Web Push (plan 0001, step 5) will add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.

## Installing on the phone

- **iPhone/iPad:** Safari → Share → **Add to Home Screen**. Push notifications (later) only reach the installed app (iOS 16.4+).
- **Android, Chrome, Edge:** "Install app" in the browser menu.
