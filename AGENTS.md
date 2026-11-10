# AGENTS.md

Day - an app of the nicasso platform (`https://day.nicasso.de`), running
behind the portal's gateway. Plans the day in fixed time blocks and shows at a glance what is on right now; mobile first, desktop just as good.

## Rules for agents

- This app follows the **nicasso app blueprint** in the platform repository
  (`github.com/nanoAtomi/multi-app`, usually checked out as `../multi-app`):
  `.agents/skills/app-blueprint/` - contract, golden-path stack, UI guidelines,
  checklist. Read the relevant part before changing auth, deploy, `portal.yml` or UI.
- Every visible UI change: send the user screenshots (phone, the changed interaction,
  desktop; mocked data) with the PR - blueprint skill `ui-screenshots`.
- Basics and plans live in [`docs/plan.md`](docs/plan.md), architecture decisions in
  `docs/architecture/adr/` - read them first. The Todo app (`../todo-app`) is the
  reference implementation: look there before inventing a pattern.
- Talk to the user in German; code, comments, commits and docs in English.
- No secrets in the repo: they are set in the portal (Apps → Day → Setup → Variables).
- **A merge to main is a release:** after a green "Build image" the app deploys itself.
  Changes reach `main` only through a pull request - see Git workflow (rollback: docs/operations/deployment.md).

## Git workflow

Never commit or push directly to `main`. Every change goes through a pull request.

This repo is mostly worked on from Claude Code cloud sessions. There, GraphQL is blocked:
`gh pr ...` and `gh issue ...` fail. Use the built-in GitHub tools or the REST API via `gh api`.

### Default mode (no instruction given)
1. Work on the session's branch. If there is none, create `claude/<short-description>` from the latest `main`.
2. Implement the change. Run lint, tests and build where possible (Docker is available).
3. Add or update tests for new behaviour.
4. Commit with Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
5. Push and open a PR against `main` (built-in GitHub tools, or `gh api repos/{owner}/{repo}/pulls`).
   Description: what, why, risks, how it was tested.
6. Wait for CI ("Build image", required check `test`): poll
   `gh api repos/{owner}/{repo}/commits/{sha}/check-runs` until every check has completed.
7. All checks green: squash-merge with
   `gh api -X PUT repos/{owner}/{repo}/pulls/{number}/merge -f merge_method=squash`.
   Any check red: fix the cause and push again. After 3 failed attempts, stop and report.
8. Do not delete the branch. GitHub deletes it after the merge.
9. After the merge, follow "Build image" and the "Deploy" run it starts on `main`
   (`gh api "repos/{owner}/{repo}/actions/runs?branch=main&per_page=3"`) until both have
   completed. Deploy ends with a smoke check of the live URL.
10. Finish with a short report: PR link, CI status, merged or not, deploy status.

### Docs in the same pull request
Keep the docs current with little effort - no extra docs for their own sake:

| Change | Docs |
|---|---|
| Small change, fix, tweak (the usual case) | **No plan.** The PR is the record. If a fact in `docs/` or `README.md` changes, update that one section in the same PR. |
| Larger feature (several PRs, decisions needed) | **One plan** `docs/plans/NNNN-<topic>.md`: set its status in `docs/plan.md` to `in progress`; when finished fill in "Outcome" and set `done`. |
| Fundamental technical decision (stack, external service, data storage, security) | **One ADR** in `docs/architecture/adr/` - rare. |

Update in place, never append notes like "changed on …"; done plans and ADRs are not rewritten.

### Review mode (user says "mit Review")
- Same steps 1 to 6, but do NOT merge. Leave the PR open.
- Add a short review summary for reading on a phone: what changed, risks, what to check
  (at most 5 points).

### Always review mode, even without instruction
- Database migrations that drop, rename or rewrite data
- Auth: gateway secret check, `portal.yml` (publicPaths, roles), anything Keycloak or Traefik
- Payment, banking or booking logic
- CI/CD workflows, deployment config and secrets

### When something breaks
- Deploy run on `main` red, or the app broken after a green deploy: open a revert PR of
  the last merge at once and merge it when its CI is green. Then fix the cause in a new PR.
- Unclear requirement: ask one short question instead of guessing.

### Never
- Push or force-push to `main`
- Merge a PR whose checks are not all green, even if GitHub would allow it
- Commit secrets or `.env` files
- Disable or skip tests to make CI pass

## Build and test

| Part | Command |
|---|---|
| Backend | `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest -q` (CI runs it against PostgreSQL 17) |
| Frontend | `cd frontend && npm ci && npm run typecheck && npm test` |
| Image | `docker build -t day-app .` |
