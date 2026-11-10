# 0001. First version

Day plans the day in fixed time blocks; opening the app shows at once what is on right now. This plan builds it in eight steps, each one pull request that ends in a deploy.

## Contents

- [Decisions](#decisions)
- [Data model](#data-model)
- [Views](#views)
- [Steps](#steps)
- [Outcome](#outcome)

## Decisions

| Topic | Decision |
|---|---|
| Stack | Golden path ([ADR 0001](../architecture/adr/0001-golden-path-one-container.md)) |
| Days from templates | Created on first access as a copy of the weekday's template; edits never flow back |
| Training | A module, not a day template, so it fits into any day |
| Running late | `fixed` or `cascade`, set globally, overridable per day |
| Seed templates | Office day (7:00 breakfast, 7:30 bathroom/dressing, 8:00 commute, 9:00 work, 17:00 commute home, 18:00 cooking, 19:00 dinner, 19:30 free time), home office, weekend, training (module) |
| Notifications | Web Push (VAPID) from an in-process scheduler at block start and optionally X minutes before. iPhone: only the installed app |
| Calendar import | Read-only ICS subscription URLs, no OAuth: Outlook "publish calendar", iCloud public calendar, Google secret iCal address. Sync every 15 minutes; events become read-only blocks with source `calendar`. Whether the company Outlook allows publishing depends on its policy - manual entry stays the fallback |
| Later | Train and flight tickets (PDF/.pkpass upload or ICS export from DB Navigator); links to tasks in the Todo app |

## Data model

| Entity | Fields |
|---|---|
| Template | owner, name, colour, icon, kind `day` / `module` |
| TemplateBlock | template, start, duration, title, category, subtask titles |
| WeekdayAssignment | owner, weekday → day template |
| Day | owner, date, template, delay mode (empty = the user's default) |
| Block | day, start, end, title, category, source `template` / `manual` / `calendar`, status `open` / `done` / `skipped`, actual start and end |
| Subtask | block, title, done |
| CalendarSource | owner, name, ICS URL, colour, last sync (step 6) |
| PushSubscription | owner, endpoint, keys (step 5) |
| Settings | on the user: default delay mode, notification lead time, time zone |

## Views

1. **Now** (start page): the current block big with the time left as a progress bar, subtasks to tick off, the next block below. Buttons: Done, Skip, +15 min.
2. **Day**: vertical timeline; drag blocks to move them, drag the edge to resize. Tapping opens a compact edit sheet. Calendar entries hatched, overlaps marked.
3. **Week**: 7 columns with mini timelines; switch a day's template from a picker.
4. **Templates**: day and module templates with the same timeline editor; modules can be inserted into a day.
5. **Statistics**: completion rate per day/week, streak, often skipped blocks.
6. **Settings**: delay mode, notifications, calendar sources.

Phone: bottom navigation Now, Day, Week, More. Desktop: Now on the left, the day's timeline on the right.

## Steps

| Step | Result | Status |
|---|---|---|
| **1** Skeleton | repo from the blueprint (gateway auth, CSRF, security headers, health, `/api/me`, "Your data", DE/EN shell, legal pages, PWA manifest, `portal.yml` with showcase, build + deploy workflows); data model with all planning tables; manual blocks (add, edit, delete, done/skip, +15 min); Now and Day views | done ([#1](https://github.com/nanoAtomi/day-app/pull/1)) |
| **2** Templates | templates and modules (CRUD, same timeline editor as a day), weekday assignment, days created from their weekday's template from today on, week previews that store nothing, switching a day's template (own blocks and modules stay), inserting a module at a chosen time, starter templates once per user; Week, Templates and More views | done ([#2](https://github.com/nanoAtomi/day-app/pull/2)) |
| **3** Drag & drop | move blocks by dragging (touch: after a long press, so the page still scrolls) and pull their bottom edge, on days and templates; delay mode `cascade` (+15 min, a longer block or a block done late pushes the following open blocks back up to the next gap) as default in Settings and per day; text fields no longer open the keyboard by themselves on touch screens | in review |
| **4** Subtasks | per block, from the template's titles; tick off on Now | |
| **5** Web Push | VAPID, scheduler, at start and X minutes before; settings | |
| **6** Calendar import | ICS sources, 15-minute sync, read-only calendar blocks | |
| **7** Statistics | status tracking, completion rate, streak, skipped blocks | |
| **8** Later | tickets (PDF/.pkpass/ICS), Todo links | |

Every step ends with a merge, and so with a deploy that can be tried right away.

## Outcome

Filled in when the plan is done.
