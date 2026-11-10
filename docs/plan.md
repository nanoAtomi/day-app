# Day – plan

Plans the day in fixed time blocks and shows at a glance what is on right now; mobile first, desktop just as good, little text.

## Contents

- [Basics](#basics)
- [Plans](#plans)

## Basics

What the app is for and for whom - product decisions, kept current. Architecture decisions (stack, data, external services) are ADRs in [architecture/adr/](architecture/adr/).

| Topic | Decision |
|---|---|
| Users | Built for one person (the owner). Like every platform app it is multi-user underneath: everyone with access to `/apps/day` gets their own, separate plan |
| Sharing & roles | None - no shared days, no app roles |
| Data | Days and time blocks (title, kind, start/end, status), subtasks, templates, settings. Personal, not sensitive. Export and delete through the portal ("Your data") |
| Time | Time zone Europe/Berlin (per user, `users.timezone`); times are minutes after local midnight, a block ends at 24:00 at the latest |
| Templates | A day is created from the weekday's template on first access - a copy, not a reference: changing the day never changes the template. Modules (e.g. training) are templates that can be inserted into any day |
| Running late | Delay mode `fixed` (blocks stay put) or `cascade` (a block running over pushes the following ones); default per user, overridable per day |
| Categories | Meal, self-care, commute, work, chores, sport, free time, other - each with an emoji and a colour |
| Devices | Phone and desktop; PWA (installable); Web Push for block starts later; offline not planned |
| Views | Phone: bottom navigation Now · Day (later Week · More). Desktop: "Now" on the left, the day's timeline on the right |
| Languages | DE + EN (the app is called "Tag" in German) |
| Platform | repo `nanoAtomi/day-app`, slug `day`, icon 🕘; portal link, sign-out, feedback; showcase on nicasso.de/apps/day |

## Plans

One file per plan in [plans/](plans/), numbered like the ADRs. Status lives here only: `planned`, `in progress`, `done`, `dropped`. A done plan is the record of what was built and is not rewritten; a change of course is a new plan.

| # | Plan | Status | Summary |
|---|---|---|---|
| 0001 | [First version](plans/0001-first-version.md) | in progress | Skeleton, now and day views, templates, drag & drop, subtasks, Web Push, calendar import, statistics - one pull request per step. |
