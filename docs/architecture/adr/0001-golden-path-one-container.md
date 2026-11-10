# 0001. Golden path: FastAPI + React in one container

- **Status:** accepted
- **Date:** 2026-11-10

## Context

Day is a new app of the nicasso platform. The platform's blueprint names a default stack, and Todo, Ideas and Finance already run on it; one way of building apps keeps them cheap to maintain.

## Decision

The blueprint's golden path, unchanged: Python 3.12 with FastAPI, SQLAlchemy 2 and Alembic (migrations at startup) on the portal-managed PostgreSQL 17; a React 19 + Vite + TypeScript SPA with Tailwind 4, TanStack Query, React Router and i18next, built in the Dockerfile and served by the backend - one image, one container.

Times of day are stored as minutes after local midnight and days as calendar dates in the user's time zone (Europe/Berlin by default), not as UTC timestamps: a plan for "7:30" stays at 7:30 across daylight saving changes.

## Consequences

- Same tooling, CI and deploy as the other apps; patterns can be copied from Todo.
- A block can't run past midnight (24:00 is the latest end). A night block would need a second block on the next day - acceptable for a day planner.
- Background work (Web Push, calendar sync) will run as an in-process scheduler like Todo's, not as a second container.
