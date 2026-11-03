# SGEN — agent notes

## Deploy / git workflow

- **The working directory is overwritten from git on every deploy.** Uncommitted
  changes are lost when `deploy-to-server.sh` / `rebuild-and-start.sh` runs.
- Therefore: **always `git commit` and `git push` after making changes**, or they
  will never reach the running service.
- Commit style: short imperative message, **no** "Generated with …" trailer and
  **no** `Co-Authored-By` lines.
- **All code, comments, docs and UI strings must be in English** — no Swedish
  anywhere in the repo.
- Active branch: `main` (remote: github.com/eskimos20/SGEN).

## Build / run

- Backend: `cd backend && mvn compile` (Spring Boot, serves on :8081).
- Full rebuild + service restart: `./rebuild-and-start.sh`
  (builds frontend into `backend/src/main/resources/static`, then the jar).
- Runtime logs: `journalctl -u sgen.service` (runs on this host, ESKIMOS-SERVER).

## Architecture notes (Garmin flow)

- With an active Garmin connection, `IntervalsService.fetchAllData` serves
  activities/events **only** from the local mirror tables
  (`intervals_activity`, `intervals_event`) — `SOURCE=DB` in logs.
  If the mirror is empty (`countByUserId == 0`) it falls back to the
  Intervals API and persists what it fetches via `IntervalsMirrorService`.
  Same DB-first + persist pattern applies to wellness
  (`intervals_wellness`, served via CalendarController), activity
  details, streams/icu_intervals (hydrated into the FTP analysis step)
  and training totals.
- `IntervalsBackfillService` runs on a dedicated single-thread executor —
  `@Async` does NOT work here (self-invocation + no @EnableAsync). The
  HTTP endpoint must return immediately; never run the import inline.
  `clearStatus` cancels a running job via the generation counter.
- The mirror is populated by `IntervalsBackfillService` (import via
  `/api/statistics/backfill-loads`), which also writes `user_daily_load`
  rows with `source='INTERVALS'` and recomputes `user_fitness` (CTL/ATL).
- `GET /api/statistics/backfill-loads/status` derives `importedActivities`
  from `sumActivityCount(userId, 'INTERVALS')` — it is DB-derived, not in-memory.
- `GarminDataCleanupService.deleteAllGarminData` must wipe Garmin tables,
  the mirror tables, all `user_daily_load`, and `user_fitness` —
  otherwise old import counts and CTL/ATL survive a disconnect.
- `garmin_activity_streams`/`garmin_activity_intervals` are keyed by
  `garmin_activities.id` — delete children before the parent rows.
