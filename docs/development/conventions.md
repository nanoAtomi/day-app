# Conventions

How code, commits and docs are written in day-app. The rules every nicasso app follows are the app blueprint in multi-app ([`.agents/skills/app-blueprint`](https://github.com/nanoAtomi/multi-app/tree/master/.agents/skills/app-blueprint)); coding rules: [`coding-standards`](https://github.com/nanoAtomi/multi-app/blob/master/.agents/skills/coding-standards/SKILL.md).

## Contents

- [Language](#language)
- [Commits](#commits)
- [Code style](#code-style)
- [Docs](#docs)

## Language

Code, comments, commits and docs are English. UI texts exist in German and English.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<area>): <what changed>`, types `feat`, `fix`, `chore`, `docs`, `test`, `ci`; summary ≤ 72 characters, the body says why.

## Code style

| Part | Tools in the repo |
|---|---|
| Backend | Python 3.12, tests with pytest |
| Frontend | TypeScript type check (`npm run typecheck`), tests with Vitest |

No formatter or linter is configured yet - see the platform plan [0008-code-style-tooling.md](https://github.com/nanoAtomi/multi-app/blob/master/docs/plans/0008-code-style-tooling.md).

## Docs

`README.md` is organisational only (what the app is, links); technical docs live in `docs/`. Docs change in the same pull request as the code they describe.
