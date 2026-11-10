# Development workflow

How a change gets from an idea to https://day.nicasso.de: branch → pull request → CI → merge → automatic deploy. Rules for AI agents (Claude Code) are in the "Git workflow" section of [`AGENTS.md`](../../AGENTS.md); this page is the same process for people.

## Contents

- [Branches](#branches)
- [Pull requests and CI](#pull-requests-and-ci)
- [Build and test](#build-and-test)
- [Merge and release](#merge-and-release)

## Branches

Never commit or push directly to `main`. Create a branch from the latest `main`:

| Kind | Name |
|---|---|
| Feature | `feature/<name>` |
| Fix | `fix/<name>` |
| Docs | `docs/<name>` |
| Claude Code session | `claude/<name>` (created by the session) |

## Pull requests and CI

Open a pull request against `main`: what changed, why, risks, how it was tested. Docs that describe the change belong in the same pull request.

"Build image" runs on every pull request (`backend`, `frontend`, `image`); its job **`test`** is the check to require. Changes to database migrations that drop or rewrite data, auth, `portal.yml` access settings, CI/CD and secrets wait for the owner's review.

## Build and test

| Part | Command |
|---|---|
| Backend | `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest -q` (CI runs it against PostgreSQL 17) |
| Frontend | `cd frontend && npm ci && npm run typecheck && npm test` |
| Image | `docker build -t day-app .` |

## Merge and release

Squash-merge once every check is green. A merge to `main` is a release - see [../operations/deployment.md](../operations/deployment.md). A red deploy is answered with a revert pull request first, then a fix.
