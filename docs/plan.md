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
| Data | Days and time blocks (title, kind, start/end, status), subtasks, templates, settings, subscribed calendars (their ICS address is a secret) and their appointments. Personal; the calendar addresses and appointments can be sensitive. Export (without addresses) and delete through the portal ("Your data") |
| Time | Time zone Europe/Berlin (per user, `users.timezone`); times are minutes after local midnight, a block ends at 24:00 at the latest |
| Templates | A day is created from the weekday's template on first access - a copy, not a reference: changing the day never changes the template. Only from today on: past days start empty. The week view only previews days not opened yet, so a template change still reaches them. Modules (e.g. training) are templates inserted into any day at a chosen time; their blocks then count as the day's own. Every user gets the starter templates once (office day Mon-Fri, weekend Sat-Sun, home office, training) |
| Running late | Delay mode `fixed` (blocks stay put) or `cascade`: a block running over (+15 min, its edge pulled down, or done late today) pushes the following open blocks back just far enough that nothing overlaps - a gap absorbs the delay; done blocks and calendar entries stay. Moving a block is placing it, never running over. Default in Settings, switchable per day |
| Day timeline | The whole day from 0:00 to 24:00; opening Day scrolls to now (other days: the first block). Tap a free spot for a draft (not saved): it moves at once, tapping it opens it to name and save, a tap beside it throws it away. Or hold a free spot: a new block follows the finger, letting go opens it, letting go over the hours on the left cancels. Text fits each block's height (two lines, one line, one small line, none) and never runs into the next block. A new block is an hour long, or ends where the next block begins. Blocks move after a long press; the grip in the middle of the bottom edge changes the length (on touch after a long press too) and stops at the next block unless the day pushes back. Deleting asks nothing - a note offers Undo. The kind is one select. Near the screen's top or bottom the page scrolls along |
| Calendars | Read-only ICS subscriptions (Outlook "publish", iCloud public link, Google secret address), synced every 15 minutes for yesterday to two weeks ahead; appointments are hatched blocks in the calendar's colour, all-day events left out. A company Outlook may not allow publishing - then manual blocks |
| Statistics | A block counts once it is over: done for the plan, skipped and left open against it. A good day has 80 % or more done; the streak counts good days back from today, days with nothing planned neither count nor break it. Often skipped: titles skipped at least twice in four weeks |
| Categories | Meal, self-care, commute, work, chores, sport, free time, other - each with an emoji and a colour |
| Devices | Phone and desktop; PWA (installable); Web Push at a block's start and optionally before (iPhone: installed app only); offline not planned |
| Views | Phone and tablet: bottom navigation Now · Day · Week · More (templates, statistics, settings). Desktop (from `lg`): top navigation Today · Week · Templates · Statistics; "Now" on the left, the day's timeline on the right |
| Languages | DE + EN (the app is called "Tag" in German) |
| Platform | repo `nanoAtomi/day-app`, slug `day`, icon 🕘; portal link, sign-out, feedback; showcase on nicasso.de/apps/day |

## Plans

One file per plan in [plans/](plans/), numbered like the ADRs. Status lives here only: `planned`, `in progress`, `done`, `dropped`. A done plan is the record of what was built and is not rewritten; a change of course is a new plan.

| # | Plan | Status | Summary |
|---|---|---|---|
| 0001 | [First version](plans/0001-first-version.md) | in progress | Skeleton, now and day views, templates, drag & drop, subtasks, Web Push, calendar import, statistics - one pull request per step. |
