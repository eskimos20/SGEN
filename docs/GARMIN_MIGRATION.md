# Garmin migration — inventory & design

Branch: `feature/garmin-integration`

Goal: SGEN should be able to replace everything Intervals.icu does **for Garmin
users** — own storage, own calculations — while the Intervals flow stays alive
for Polar/Suunto/COROS etc. Garmin data never leaves SGEN (§5(o) of Garmin's
developer agreement); planned workouts are pushed to BOTH Garmin (Training API)
and Intervals (distribution to Zwift/Rouvy/MyWhoosh).

---

## 1. Inventory: everything fetched/calculated via Intervals.icu today

### 1.1 Data fetching (`IntervalsService.fetchAllData` — dashboard/statistics)

| Intervals call | Contents | Consumed by |
|---|---|---|
| `GET /athlete/{id}/activities?oldest&newest` | Activity list (all fields: load, zones, stream references) | Calendar, lists, FTP/VO2 pipeline |
| `GET /activity/{id}?intervals=true` (per activity, in parallel) | `icu_intervals`, `icu_max_watts` | Interval data in the list |
| `GET /activity/{id}/streams` (per activity) | time series (watts, heartrate, velocity, distance, latlng) | Interval enrichment + FTP calc |
| `GET /athlete/{id}` | Profile incl `icu_weight` | Weight → W/kg |
| `GET /athlete/{id}/sport-settings` | FTP, indoor_ftp, LTHR, zones per sport | TSS, zoning, power-curve filter |
| `GET /athlete/{id}/events?oldest&newest` | Planned workouts/events | Calendar |

### 1.2 Activity details (`getActivityDetails`)

- Same calls as above + `GET /activity/{id}/power-curve`, `GET /activity/{id}/map`
- `GET /activity/{id}/map.png` + `GET /activity/{id}/power.png` — **pre-rendered PNGs from Intervals** (must be replaced by own rendering: `ActivityMap.jsx` can draw from the latlng stream)
- **Already calculated locally today:**
  - `enrichIntervalsFromStreams` — sets `start_hr`, `end_hr`, `hrr` (HR drop 60s into recovery) on each interval
  - `calculatePaceFromStreams` — pace curve per duration (30s–3h) via sliding window over `velocity_smooth` or `distance`
  - `extractIntervalSummary` — per interval: duration, avg/max watts, HR, hrr, zone

### 1.3 FTP/VO2max pipeline (`IntervalsActivityAnalysisService.processActivity`)

- Per activity: sliding window over the `watts` stream → best 5-min average
- `performanceService.updateFtpIfBetter` (85%? — check PerformanceService) and
  `updateVo2MaxIfBetter` (W/kg-based estimate) → local `ftp_results`/`vo2max_results` tables
- **Already local** — reusable directly for Garmin streams

### 1.4 Wellness (`IntervalsWellnessService` + `CalendarController`)

- `GET /wellness?oldest&newest` → frontend reads the fields:
  `id, ctl, atl, rampRate, hrv, hrvSDNN, restingHR, sleepScore, sleepSecs, weight, readiness`
- **`ctl`/`atl`/`rampRate`/`readiness`/`sleepScore` are calculated by Intervals** — must be computed locally for Garmin
- `PUT /wellness-bulk` — used for manual entries (soreness etc.) → needed for Garmin users as a custom table edit
- `GET /hr-curves` — HR curves → can be calculated from own streams

### 1.5 Events/calendar (`IntervalsEventService`, `CalendarController`, `WorkoutShareService`)

- `POST /athlete/{id}/events/bulk?upsert=true` — workouts are scheduled. Payload contains:
  `start_date_local, name, description, type ('Ride'/'Run'), category:'WORKOUT',
   moving_time, icu_training_load, indoor, workout_doc{...sport_type}, file_contents (ZWO XML), filename`
- The `calendar_events` table mirrors `intervals_event_id` + deload flag
- **This is where Garmin push hooks in:** same scheduling point → also a Training API call

### 1.6 Athlete/settings (`IntervalsAthleteService`)

- GET/PUT `/athlete/{id}` + `/settings` + `/sport-settings` (CRUD, matching-activities, apply)
- `UPDATABLE_PROFILE_FIELDS` contains `icu_garmin_*` toggles — for Garmin users these should be disabled in Intervals
- FTP/LTHR fetching (`getFtpForSport`, `getIndoorFtpForSport`, `getLthrForSport`) — for Garmin users sport settings must be stored locally (new table or reuse existing profile)
- `getAvailableActivityTypes` — fetches enum from the Intervals openapi spec → hardcode a local list

### 1.7 Training totals (`getTrainingTotalsActivities`)

- Fields: `moving_time, distance, coasting_time, total_elevation_gain, icu_training_load, calories, icu_zone_times, icu_hr_zone_times, pace_zone_times, gap_zone_times`
- **Zone times and icu_training_load are calculated by Intervals** → locally: TSS from NP (watts stream) or hrTSS; zone times from streams + local zone boundaries

### 1.8 Other Intervals dependencies

- `uploadActivity` (multipart → /activities) — keep for manual upload to Intervals
- `findBestEfforts`, `computeIntervalsFromStreams` (already local sliding-window — reuse for Garmin)
- `updateActivityIntervals` (PUT intervals to Intervals) → for Garmin: save locally in a table
- `IntervalsGearService` — gear sync via Intervals → for Garmin: gear events locally or via Intervals if the user has an account
- `testConnection` — Intervals connection test (keep for the Intervals integration)

### 1.9 Summary: what Intervals computes server-side that must be built locally

| Calculation | Input | New class |
|---|---|---|
| `icu_training_load` (TSS) | watts stream + FTP | `TrainingLoadCalculator` (TSS via NP; hrTSS/TRIMP fallback) |
| `ctl/atl/tsb` + rampRate | daily load | `FitnessModelService` (EMA 42/7, ramp = ΔCTL/week) |
| `icu_intervals` (interval detection) | streams | `IntervalDetectionService` (power/HR plateaus or lap markers) |
| `icu_zone_times`, `hr_zone_times`, `pace/gap_zone_times` | streams + zones | `ZoneTimeCalculator` |
| `power-curve` / `hr-curves` | all streams | `CurveCalculator` (halfway there already: the pace curve exists) |
| `sleepScore`, `readiness` | wellness | Map from Garmin `sleeps.overallSleepScore`; readiness → Body Battery or omit |
| map.png / power.png | streams | Frontend rendering (`ActivityMap`, recharts) |
| best-efforts | streams | the `computeIntervalsFromStreams` logic (already local) |
| FTP/VO2max update | 5-min watts | the `processActivity` logic (already local) |

---

## 2. Garmin implementation — design (verified against official specs v2.0/2.1)

### 2.1 Tier: Starter (business) — push only, no history

Verified from Start Guide 2.0 + the API specs:
- ≤1000 connected users, **one** client ID per licensee, app marked "unverified"
- Requirement: **publicly reachable website + published privacy policy** (for Garmin's review)
- Push-only: all notifications are configured per summary type at
  `https://apis.garmin.com/tools/endpoints` — HTTPS POST, data inline in the body
- **"Other protocols and non-standard ports are not supported"** — notification URLs must be
  standard HTTPS on port 443. `:50505` is probably NOT accepted → stunnel/proxy must listen on 443
  (the same restriction may apply to the OAuth redirect_uri — verify in the portal)
- Enabled/On Hold per type: On Hold queues notifications for ≤7 days (useful during maintenance)
- A new domain triggers a security review, 24–48h, in the endpoint tool
- Server-to-server only; "ad hoc requests for data are not permitted"

### 2.2 OAuth 2.0 PKCE flow (official spec, confirmed)

```
Authorize:  GET https://connect.garmin.com/oauth2Confirm
            ?response_type=code&client_id=..&code_challenge=S256(..)
            &code_challenge_method=S256&redirect_uri=..&state=..

Token:      POST https://diauth.garmin.com/di-oauth2-service/oauth/token
            Authorization: Basic base64(client_id:client_secret)
            form: grant_type=authorization_code|refresh_token, code, code_verifier,
                  redirect_uri (= the step-1 value)

UserId:     GET  https://apis.garmin.com/partner-gateway/rest/user/id
Disconnect: DELETE https://apis.garmin.com/partner-gateway/rest/user/registration
Perms:      GET  https://apis.garmin.com/partner-gateway/rest/user/permissions
```

Response: `access_token, expires_in:86400 (24h), refresh_token,
refresh_token_expires_in:~7775998 (90d), scope:"PARTNER_WRITE PARTNER_READ
CONNECT_READ CONNECT_WRITE" (fixed scope)` — the refresh token **is rotated on
every refresh**, always store the new one. Subtract ≥600s from expires_in. Token
exchange must ALWAYS happen from the backend (never the client). Permissions the
user can grant: `ACTIVITY_EXPORT, HEALTH_EXPORT, WORKOUT_IMPORT, COURSE_IMPORT,
MCT_EXPORT (HISTORICAL_DATA_EXPORT = Enterprise only)`. userId is persistent
across re-registrations (same Garmin account → same API userId).

### 2.3 Push Service — official requirements

- Timeout **30s**; respond **HTTP 200 BEFORE all processing** (async is mandatory)
- Retry: once per hour for up to **7 days** on non-200
- **Header `garmin-client-id`** is sent with every POST (+ userId in items) —
  validate it against your client id instead of a path token (the spec's curl
  example also shows `user-agent: Garmin Health API`)
- Source IPs to whitelist (optional extra layer):
  `204.77.162.0/23, 204.77.163.0/24, 98.199.124.0/23, 185.132.79.0/24,
  208.65.206.0/23, 185.207.94.0/23, 198.233.176.0/24`
- **Updated summaries:** the same userId+startTime+type may arrive again with
  newer data → always UPSERT, latest wins (sleep/dailies are updated often)
- Health API summary types: `dailies, epochs, sleeps, bodyComps, stressDetails,
  userMetrics, pulseox, allDayRespiration, healthSnapshot, hrv, bloodPressures,
  skinTemp, nutrition, hydration, breathingVariations`
- Activity API summary types: `activities, activityDetails, activityFiles,
  moveIQActivities, manuallyUpdatedActivities`
- Special keys: `deregistrations` ([{userId}]) + `userPermissionsChange`
  ([{userId, summaryId, permissions[], changeTimeInSeconds}]) → respond 200,
  delete the connection on deregistration

### 2.4 Activity API — payloads (confirmed fields)

**activities** (summary): `summaryId, activityId, activityType, activityName,
startTimeInSeconds, startTimeOffsetInSeconds, durationInSeconds,
averageSpeedInMetersPerSecond, distanceInMeters, activeKilocalories,
averageHeartRateInBeatsPerMinute, maxHeartRateInBeatsPerMinute,
averageBikeCadenceInRoundsPerMinute, averageRunCadenceInStepsPerMinute,
averagePaceInMinutesPerKilometer, steps, totalElevationGainInMeters,
totalElevationLossInMeters, startingLatitude/LongitudeInDegree, deviceName,
isParent, parentSummaryId (MULTI_SPORT children!), manual, isWebUpload`

**activityDetails**: `{ summary: {same as activities}, samples: [{startTimeInSeconds,
latitudeInDegree, longitudeInDegree, elevationInMeters, airTemperatureCelcius,
heartRate, speedMetersPerSecond, stepsPerMinute, totalDistanceInMeters,
timerDurationInSeconds, clockDurationInSeconds, movingDurationInSeconds,
powerInWatts, bikeCadenceInRPM, swimCadenceInStrokesPerMinute}],
laps: [{startTimeInSeconds}] }` — max 24h workouts, samples ~1Hz "valid until next"
→ map straight into `garmin_activity_streams.streams_json` (Intervals format:
time←timerDurationInSeconds, watts←powerInWatts, heartrate←heartRate,
velocity_smooth←speedMetersPerSecond, distance←totalDistanceInMeters,
latlng←lat/lng, altitude←elevationInMeters, cadence←bikeCadence|stepsPerMinute)

**activityFiles**: `{userId, summaryId:"<id>-file", fileType:"FIT|TCX|GPX",
callbackURL, activityType, deviceName, startTimeInSeconds, activityId,
activityName, activityDescription?, manual}` — callbackURL valid **24h**,
**ONE** download (duplicates → HTTP 410), token in URL param. Starter limit 50/min.
Not needed in phase 1 (activityDetails covers <24h workouts) but queue in garmin_file_queue.

**moveIQActivities** / **manuallyUpdatedActivities**: auto-detected and
manually edited workouts respectively — store as activities, flag `manual`.

### 2.5 Training API v2 — pushing workouts to Garmin

Endpoints (Bearer):
```
POST   https://apis.garmin.com/workoutportal/workout/v2        ← create (note: workoutportal!)
GET    https://apis.garmin.com/training-api/workout/v2/{workoutId}
PUT    https://apis.garmin.com/training-api/workout/v2/{workoutId}
DELETE https://apis.garmin.com/training-api/workout/v2/{workoutId}

POST   https://apis.garmin.com/training-api/schedule/          {workoutId, date:"YYYY-mm-dd"}
GET/PUT/DELETE https://apis.garmin.com/training-api/schedule/{workoutScheduleId}
GET    https://apis.garmin.com/training-api/schedule?startDate&endDate
```

Workout JSON (v2 = segments model):
`workoutName, description(≤1024), sport (RUNNING|CYCLING|LAP_SWIMMING|
STRENGTH_TRAINING|CARDIO_TRAINING|GENERIC|YOGA|PILATES|MULTI_SPORT),
poolLength/-Unit (swim), workoutProvider, workoutSourceId (≤20 chars),
isSessionTransitionEnabled, segments:[{segmentOrder, sport, steps:[...]}]`

Step: `type: WorkoutStep|WorkoutRepeatStep, stepOrder, intensity
(REST|WARMUP|COOLDOWN|RECOVERY|ACTIVE|INTERVAL|MAIN), description(≤512),
durationType (TIME|DISTANCE|HR_LESS_THAN|HR_GREATER_THAN|CALORIES|OPEN|
POWER_LESS_THAN|POWER_GREATER_THAN|REPS|FIXED_REST|LAP_BUTTON-like),
durationValue, durationValueType(PERCENT), targetType (SPEED|HEART_RATE|
CADENCE|POWER|GRADE|RESISTANCE|POWER_3S/10S/30S|POWER_LAP|SPEED_LAP|
HEART_RATE_LAP|PACE|OPEN), targetValue (zone 1-5 HR / 1-7 power),
targetValueLow/High (custom range), targetValueType(PERCENT),
secondaryTarget*` (+ swim fields: strokeType, drillType, equipmentType,
exerciseCategory/Name for strength/cardio).

RepeatStep: `repeatType: REPEAT_UNTIL_STEPS_CMPLT|REPEAT_UNTIL_TIME|
REPEAT_UNTIL_DISTANCE|REPEAT_UNTIL_CALORIES|REPEAT_UNTIL_HR_*|
REPEAT_UNTIL_POWER_*` + `repeatValue` + `steps:[...]` (nested).

Limits: 100 steps/single-sport, 25 segments + 250 steps/multisport.
Response codes: 200/204 ok, 400, 401 (missing UAT), 403, 412 (missing permission),
429 (rate limit).

**Starter rate limits:** 100 req/min per app (OAuth+API counted together),
**200 req/user/day** — important: schedule workout pushes sparingly,
do not batch per activity.

### 2.6 New tables (MySQL — docs/sql/001_garmin_schema.sql)

```sql
garmin_connections
  id PK, user_id FK, garmin_user_id VARCHAR UNIQUE,
  access_token TEXT (encrypted), refresh_token TEXT (encrypted),
  token_expires_at DATETIME, refresh_expires_at DATETIME,
  scopes VARCHAR, created_at, updated_at

garmin_activities
  id PK, user_id FK, garmin_activity_id BIGINT UNIQUE,
  name, activity_type VARCHAR, start_time BIGINT, start_time_offset INT,
  duration_s INT, distance_m DOUBLE, calories INT,
  avg_hr INT, max_hr INT, avg_power DOUBLE, norm_power DOUBLE,
  avg_speed DOUBLE, elevation_gain DOUBLE, training_load DOUBLE,
  raw_json MEDIUMTEXT, created_at
  INDEX(user_id, start_time)

garmin_activity_streams
  activity_id PK/FK → garmin_activities,
  streams_json MEDIUMTEXT   -- normalized Intervals format:
  -- {time:[], watts:[], heartrate:[], velocity_smooth:[],
  --  distance:[], latlng:[[..]], altitude:[], cadence:[]}

garmin_activity_intervals
  id PK, activity_id FK, start_idx, end_idx, duration_s,
  type (WORK/REST/...), avg_watts, max_watts, avg_hr, start_hr, end_hr, hrr, zone

garmin_wellness
  id PK, user_id FK, summary_type VARCHAR, summary_date DATE,
  payload_json MEDIUMTEXT, UNIQUE(user_id, summary_type, summary_date)

garmin_push_inbox          -- dedup + async queue + retry protection
  id PK, summary_type VARCHAR, summary_id VARCHAR,
  payload_json MEDIUMTEXT, status (PENDING/PROCESSED/FAILED/IGNORED),
  attempts INT, received_at, processed_at,
  UNIQUE(summary_type, summary_id)

garmin_file_queue          -- activityFiles/FIT fetching
  id PK, user_id FK, summary_id VARCHAR, callback_url TEXT,
  file_type VARCHAR, status, fit_bytes MEDIUMBLOB, created_at, fetched_at
```

### 2.7 New classes (package `com.sgen.garmin`)

| Class | Responsibility |
|---|---|
| `GarminOAuthService` | Build authorize URL (PKCE), exchange code→tokens, refresh (scheduled + on-demand), `user/id`, `DELETE /registration` |
| `GarminApiClient` / `GarminClientFactory` | WebClient per user with Bearer + auto-refresh (parallel to IntervalsClientFactory) |
| `GarminConnectionController` | `GET /api/garmin/status`, `POST /api/garmin/connect-url` (popup flow like Strava), `GET /api/garmin/callback` (permitAll → exchange → redirect to `garmin-callback.html`), `DELETE /api/garmin/disconnect` |
| `GarminPushController` | `POST /api/garmin/push/{token}` (permitAll, validate path token) → persist `garmin_push_inbox` → 200 immediately |
| `GarminPushProcessor` (@Async) | Dispatch per top-level key: `activities, activityDetails, dailies, sleeps, hrv, bodyComps, userMetrics, stressDetails, pulseOx, respiration, bloodPressures, skinTemp, moveiq, activityFiles, deregistrations, userPermissionsChange` |
| `GarminActivityMapper` | push item → `garmin_activities` + streams (from `activityDetails` ~1Hz samples) + interval detection + load |
| `GarminWellnessMapper` | hrv/sleeps/dailies/bodyComps/userMetrics → `garmin_wellness` + normalized fields (restingHR, hrv, sleepSecs, sleepScore, weight) |
| `TrainingLoadCalculator` | TSS from NP (watts), hrTSS/TRIMP fallback for HR-only workouts |
| `FitnessModelService` | Daily load (local Garmin + Intervals `icu_training_load`) → CTL/ATL/TSB EMA + rampRate → own `daily_fitness` table or on-the-fly |
| `ZoneTimeCalculator` | Zone times from streams + local sport zones |
| `CurveCalculator` | Power/pace/HR curves from streams (build on the pace logic) |
| `IntervalDetectionService` | WORK/REST intervals from streams (or lap data in activityDetails/FIT) |
| `GarminWorkoutService` | `POST /training-api/workout` → `POST /training-api/schedule` (+ possibly DELETE — verify in portal spec) |
| `GarminWorkoutMapper` | `workout_doc`/ZWO → Garmin workout JSON (steps, repeats, targets; %FTP→watts via local sport FTP) |
| `GarminMergeService` | Unified read: Intervals activities + `garmin_activities` → same JSON shape; dedup `start_time ±2min + duration ±10%` |
| `GarminFileService` | `activityFiles` callbackURL → download FIT → (phase 2: FIT parse; phase 1: activityDetails suffices) |

### 2.8 Changes to existing code

- `SecurityConfig`: `permitAll` on `/api/garmin/callback`, `/api/garmin/push/**`, `/garmin-callback.html`
- `fetchAllData`: append local Garmin activities to the `activities` array (same shape, `source:'GARMIN'`)
- `getActivityDetails`: route `garmin_*` ids → local store
- Wellness fetch: merge `garmin_wellness` → Intervals shape (`id=date, hrv, restingHR, sleepSecs, sleepScore, weight, ctl, atl`)
- CalendarController/event-create: after the Intervals event POST → also `GarminWorkoutService.pushWorkout` (async, fail-safe)
- `UPDATABLE_PROFILE_FIELDS`: on Garmin connect — disable `icu_garmin_*` in Intervals (PUT athlete)
- `application.yml`: `garmin.client-id/secret/redirect-uri/push-token/api-base`
- Frontend: `garmin-callback.html` (copy of strava-callback), the Connections page: Garmin button instead of/after Strava removal

### 2.9 Strava removal (same branch)

`StravaService`, `StravaCallbackController`, `StravaStatisticsController`,
`StravaNotConnectedException`, `StravaRateLimitException`, User entity strava fields,
`stravaOAuth.js`, `strava-callback.html`, `STRAVA_REDIRECT_URI` in deploy script,
`strava:` in application.yml, frontend strava sections, DB migration dropping the columns.

### 2.10 Portal values (to fill in at Garmin) — CONFIRMED

```
Logo:           https://raw.githubusercontent.com/eskimos20/SGEN/main/frontend/public/logo.png
Redirect URI:   https://eskimoshome.freeddns.org/api/garmin/callback      ← no port! (443)
Push endpoints (all types, same URL, configured at apis.garmin.com/tools/endpoints):
                https://eskimoshome.freeddns.org/api/garmin/push
```

**⚠️ PORT REQUIREMENT:** The spec explicitly says "non-standard ports are not supported".
`eskimoshome.freeddns.org:50505` probably does NOT work for notification URLs
(and possibly not for redirect_uri either). The server must respond on
**standard HTTPS port 443** → stunnel/proxy must be moved to 443, or a
separate vhost/subdomain on 443 that proxies to backend:8081.

Validation of incoming notifications (instead of a path token):
check header `garmin-client-id` == our client id + userId exists in
garmin_connections. (IP whitelist also exists as an extra layer, see 2.3.)

Enable per summary type: Activity API (activities, activityDetails,
activityFiles), Health API (dailies, sleeps, hrv, bodyComps, userMetrics,
stressDetails, epochs, pulseox, allDayRespiration, bloodPressures, skinTemp),
Training API + permissions WORKOUT_IMPORT/ACTIVITY_EXPORT/HEALTH_EXPORT.
Deregistrations + the UserPermission webhook should also point here.

Other Starter requirements: public site + published privacy policy, ≤1000 users.

### 2.11 Remaining open points

- Test whether the portal accepts redirect_uri/push URL with :50505 (otherwise reconfigure to 443, see above)
- Exact payload of `userPermissionsChange` on revoked HEALTH_EXPORT (mark connection NEEDS_REAUTH)
- Whether `activityFiles` is pushed to Starter (otherwise only activityDetails — ok for <24h workouts)
- Response details on Training API 400 errors (field-level feedback)
