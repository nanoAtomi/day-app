# Getting started

How to run Day on your machine. Day runs as an app of the nicasso platform (https://day.nicasso.de); on the platform, sign-in, database and routing come from the portal - locally the defaults below apply.

## Contents

- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Docs](#docs)

## Prerequisites

- Python 3.12 (backend; the version CI uses) and Node.js 24 (frontend).
- Locally the backend uses SQLite and every request is the dev user - no Keycloak needed. CI and production use PostgreSQL 17.

## Local development

Backend (SQLite, every request is the user `dev`):

```bash
cd backend
python -m pip install -r requirements-dev.txt
AUTH_MODE=dev uvicorn app.main:app --reload --port 8000
```

Frontend with hot reload (proxies `/api` to the backend):

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

Or build the frontend once (`npm run build`); the backend then serves it on http://localhost:8000.

Tests:

```bash
cd backend && python -m pytest -q
cd frontend && npm run typecheck && npm test
```

Database changes: change [backend/app/models.py](../backend/app/models.py), then add a migration with `cd backend && alembic revision --autogenerate -m "describe change"` and check it by hand. Migrations run automatically at startup.

## Configuration

| Variable | Meaning |
|---|---|
| `AUTH_MODE` | `gateway` behind the nicasso gateway (`portal.yml`), `dev` locally only |
| `GATEWAY_SHARED_SECRET` | set by the portal; proves a request came through the gateway |
| `DATABASE_URL` | set by the portal (`database: true`); defaults to `sqlite:///./day.db` |
| `PORTAL_URL`, `PORTAL_LOGOUT_URL` | set by the portal; the "‹ Portal" chip and "Sign out" |
| `DEV_USER` | user name in `dev` mode |
| `STATIC_DIR` | where the built frontend is (`/srv/static` in the image) |

## Docs

| Doc | What it covers |
|---|---|
| [plan.md](plan.md) | Product decisions and every plan with its status |
| [architecture/arc42.md](architecture/arc42.md) | How the app is built; ADRs in [architecture/adr/](architecture/adr/) |
| [operations/deployment.md](operations/deployment.md) | Release, rollback, one-time setup in the portal |
| [operations/backup.md](operations/backup.md) | What is backed up, how to restore |
| [development/workflow.md](development/workflow.md) · [conventions.md](development/conventions.md) | Branch → PR → CI → release · code and commit style |
