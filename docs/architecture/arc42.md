# Architecture (arc42, lean)

How Day is built: goals, context, building blocks, cross-cutting concepts and the decisions behind them.

## Contents

- [1. Goals](#1-goals)
- [3. Context](#3-context)
- [5. Building blocks](#5-building-blocks)
- [7. Deployment](#7-deployment)
- [8. Concepts](#8-concepts)
- [9. Decisions](#9-decisions)

## 1. Goals

| Goal | Means |
|---|---|
| See what is on right now within a second | "Now" is the start page; the day comes from TanStack Query's cache on revisits |
| Phone first, desktop as good | Bottom navigation and sheets on phones; two columns (Now + timeline) from `lg` |
| Fits the platform | nicasso app blueprint: gateway identity, portal deploy, shared look |

## 3. Context

```
Browser / installed PWA ──HTTPS──▶ Traefik ─▶ oauth2-proxy (Keycloak login) ─▶ app-day (this app)
                                                                              └─▶ PostgreSQL (app-day-db)
portal-api ──internal──▶ app-day /api/platform/users/* (export and delete of a person)
```

Later: ICS calendar URLs (read, step 6) and push services of the browsers (Web Push, step 5).

## 5. Building blocks

| Part | Path | What it does |
|---|---|---|
| App | `backend/app/main.py` | FastAPI app: CSRF check, security and cache headers, health, routers, the SPA |
| Identity | `backend/app/auth.py` | the user from the gateway headers, created on first sight |
| Days and blocks | `backend/app/api/days.py` | day of a date (created on first access), blocks: add, change, status, delete |
| Me | `backend/app/api/me.py` | the user, platform links and settings (delay mode, lead time, time zone) |
| Your data | `backend/app/platform_data.py` | export and delete for the portal |
| Data | `backend/app/models.py`, `backend/migrations/` | SQLAlchemy models, Alembic migrations (run at startup) |
| Frontend | `frontend/src` | `pages/PlannerPage.tsx` (Now + Day), `components/NowPanel.tsx`, `Timeline.tsx`, `BlockSheet.tsx`; platform shell from the blueprint |

## 7. Deployment

One image `ghcr.io/nanoatomi/day-app` (Node builds the SPA, Python serves it and the API), run by the portal as container `app-day` with its own PostgreSQL 17. See [operations/deployment.md](../operations/deployment.md).

## 8. Concepts

- **Time:** a day is a date in the user's time zone; blocks hold minutes after midnight (`start_minute`, `end_minute`, 0-1440). The frontend reads "now" with `Intl` in the user's time zone, so a phone in another zone still sees the Berlin plan.
- **Ownership:** every day belongs to a user; blocks are reached only through their day's owner (404 otherwise). Tests prove one user can't see or change another's blocks.
- **Calendar blocks** (`source = calendar`) are read-only: only their status changes.
- **Optimistic updates:** done, skip and +15 min show at once and roll back on an error.
- **Overlaps:** blocks that share time sit side by side on the timeline with an amber mark.

## 9. Decisions

| ADR | Decision |
|---|---|
| [0001](adr/0001-golden-path-one-container.md) | Golden path: FastAPI + React in one container; local times as minutes |
