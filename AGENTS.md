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

- `IntervalsService` is a thin orchestrator. Domain work lives in:
  `IntervalsActivityFeedService` (activity list + hydration),
  `IntervalsActivityDetailService` (single-activity view),
  `IntervalsActivityOpsService` (update/delete/upload/interval ops),
  `IntervalsStatsService` (curves, training totals, preferences),
  `IntervalsImageService` (map/chart PNGs), `IntervalsMirrorService`
  (mirror persistence), `IntervalsApiClient` (all rate-limited GETs).
- With an active Garmin connection, `IntervalsService.fetchAllData` serves
  activities/events **only** from the local mirror tables
  (`intervals_activity`, `intervals_event`) — `SOURCE=DB` in logs.
  **No Intervals activity-data GETs ever run for Garmin-connected users.**
  The only exception is the one-time bootstrap import when the mirror is
  empty — gated by the `activities-seeded` doc in `intervals_documents` so
  it never re-triggers. There are NO lazy "heal" fetches: missing
  streams/intervals/details/map stay missing until the backfill importer
  populates them. Wellness, training totals, power/HR/pace curves,
  compute-intervals and best-efforts are all mirror/local-Garmin only.
  Activity details for mirror-missed ids return `{incomplete: true}`.
- Allowed Intervals reads for Garmin users: athlete profile +
  sport-settings (served mirror-first from `intervals_athlete`, refreshed
  ~24h via `fetchMirroredDoc`/`GarminSportSettingsService`), single-event
  fetch/update fallback, and all writes (activity upload/update/delete,
  gear, intervals, events, wellness).
- `garmin_`-prefixed ids are routed locally everywhere: detail view,
  update, delete (children first + daily-load row + upstream copy via
  `garmin_activities.intervals_activity_id`), interval writes
  (`garmin_activity_intervals`), compute-intervals (stored streams), gear
  (PUT to the linked Intervals copy).
- `GarminWorkoutService`/`GarminPushProcessor` run background work on
  dedicated executors — `@Async` is dead code (no `@EnableAsync`); do not
  rely on it.
- `garmin_activities.intervals_activity_id` links a Garmin activity to its
  uploaded Intervals copy — set by `GarminFileService` after FIT upload and
  lazily by `pushToIntervalsCopy`/gear update via the time-match heuristic.
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
