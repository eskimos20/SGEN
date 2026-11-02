# Garmin-migration — inventering & design

Branch: `feature/garmin-integration`

Mål: SGEN ska kunna ersätta allt Intervals.icu gör **för Garmin-användare** —
egen lagring, egna beräkningar — samtidigt som Intervals-flödet lever kvar
för Polar/Suunto/COROS m.fl. Garmin-data lämnar aldrig SGEN (§5(o) i Garmins
developer agreement), planerade pass pushas till BÅDE Garmin (Training API)
och Intervals (distribution till Zwift/Rouvy/MyWhoosh).

---

## 1. Inventering: allt som hämtas/beräknas via Intervals.icu idag

### 1.1 Datahämtning (`IntervalsService.fetchAllData` — dashboard/statistics)

| Intervals-anrop | Innehåll | Konsumeras av |
|---|---|---|
| `GET /athlete/{id}/activities?oldest&newest` | Aktivitetslista (alla fält: load, zones, streams-referenser) | Kalender, listor, FTP/VO2-pipeline |
| `GET /activity/{id}?intervals=true` (per aktivitet, parallellt) | `icu_intervals`, `icu_max_watts` | Intervalldata i listan |
| `GET /activity/{id}/streams` (per aktivitet) | tidsserier (watts, heartrate, velocity, distance, latlng) | Intervall-berikning + FTP-calc |
| `GET /athlete/{id}` | Profil inkl `icu_weight` | Vikt → W/kg |
| `GET /athlete/{id}/sport-settings` | FTP, indoor_ftp, LTHR, zoner per sport | TSS, zonering, power-curve-filter |
| `GET /athlete/{id}/events?oldest&newest` | Planerade pass/events | Kalender |

### 1.2 Aktivitetsdetaljer (`getActivityDetails`)

- Samma anrop som ovan + `GET /activity/{id}/power-curve`, `GET /activity/{id}/map`
- `GET /activity/{id}/map.png` + `GET /activity/{id}/power.png` — **färdigrenderade PNG:er från Intervals** (måste ersättas av egen rendering: `ActivityMap.jsx` kan rita av latlng-stream)
- **Lokal beräkning redan idag:**
  - `enrichIntervalsFromStreams` — sätter `start_hr`, `end_hr`, `hrr` (HR-drop 60s in i recovery) på varje intervall
  - `calculatePaceFromStreams` — pace-kurva per duration (30s–3h) via sliding window över `velocity_smooth` eller `distance`
  - `extractIntervalSummary` — per-intervall: duration, avg/max watts, HR, hrr, zon

### 1.3 FTP/VO2max-pipeline (`IntervalsActivityAnalysisService.processActivity`)

- Per aktivitet: sliding window över `watts`-stream → bästa 5-min snitt
- `performanceService.updateFtpIfBetter` (85%? — kontrollera PerformanceService) och
  `updateVo2MaxIfBetter` (W/kg-baserad uppskattning) → lokala `ftp_results`/`vo2max_results`-tabeller
- **Redan lokal** — återanvändbar direkt för Garmin-streams

### 1.4 Wellness (`IntervalsWellnessService` + `CalendarController`)

- `GET /wellness?oldest&newest` → frontend läser fälten:
  `id, ctl, atl, rampRate, hrv, hrvSDNN, restingHR, sleepScore, sleepSecs, weight, readiness`
- **`ctl`/`atl`/`rampRate`/`readiness`/`sleepScore` beräknas av Intervals** — måste räknas lokalt för Garmin
- `PUT /wellness-bulk` — används för manuella inmatningar (soreness etc.) → behövs för Garmin-användare som egen tabell-edit
- `GET /hr-curves` — HR-kurvor → kan beräknas av egna streams

### 1.5 Events/kalender (`IntervalsEventService`, `CalendarController`, `WorkoutShareService`)

- `POST /athlete/{id}/events/bulk?upsert=true` — pass schemaläggs. Payload innehåller:
  `start_date_local, name, description, type ('Ride'/'Run'), category:'WORKOUT',
   moving_time, icu_training_load, indoor, workout_doc{...sport_type}, file_contents (ZWO XML), filename`
- `calendar_events`-tabellen speglar `intervals_event_id` + deload-flagga
- **Här hakar Garmin-push in:** samma scheduling-punkt → även Training API-anrop

### 1.6 Athlete/settings (`IntervalsAthleteService`)

- GET/PUT `/athlete/{id}` + `/settings` + `/sport-settings` (CRUD, matching-activities, apply)
- `UPDATABLE_PROFILE_FIELDS` innehåller `icu_garmin_*`-toggles — för Garmin-användare ska dessa stängas av i Intervals
- FTP/LTHR-hämtning (`getFtpForSport`, `getIndoorFtpForSport`, `getLthrForSport`) — för Garmin-användare måste sport-inställningar lagras lokalt (ny tabell eller återanvänd befintlig profil)
- `getAvailableActivityTypes` — hämtar enum ur Intervals openapi-spec → hårdkoda lokal lista

### 1.7 Training totals (`getTrainingTotalsActivities`)

- Fält: `moving_time, distance, coasting_time, total_elevation_gain, icu_training_load, calories, icu_zone_times, icu_hr_zone_times, pace_zone_times, gap_zone_times`
- **Zontider och icu_training_load beräknas av Intervals** → lokalt: TSS ur NP (watts-stream) eller hrTSS; zontider ur streams + lokala zongränser

### 1.8 Övriga Intervals-beroenden

- `uploadActivity` (multipart → /activities) — behåll för manuell uppladdning till Intervals
- `findBestEfforts`, `computeIntervalsFromStreams` (redan lokal sliding-window — återanvänd för Garmin)
- `updateActivityIntervals` (PUT intervals till Intervals) → för Garmin: spara lokalt i tabell
- `IntervalsGearService` — gear-sync via Intervals → för Garmin: gear-events lokalt eller via Intervals om användaren har konto
- `testConnection` — Intervals-anslutningstest (behåll för Intervals-koppling)

### 1.9 Sammanfattning: vad Intervals räknar server-side som måste byggas lokalt

| Beräkning | Input | Ny klass |
|---|---|---|
| `icu_training_load` (TSS) | watts-stream + FTP | `TrainingLoadCalculator` (TSS via NP; hrTSS/TRIMP-fallback) |
| `ctl/atl/tsb` + rampRate | daglig load | `FitnessModelService` (EMA 42/7, ramp = ΔCTL/vecka) |
| `icu_intervals` (intervall- detektion) | streams | `IntervalDetectionService` (power/HR-platåer eller lap-markörer) |
| `icu_zone_times`, `hr_zone_times`, `pace/gap_zone_times` | streams + zoner | `ZoneTimeCalculator` |
| `power-curve` / `hr-curves` | alla streams | `CurveCalculator` (redan halvvägs: pace-kurvan finns) |
| `sleepScore`, `readiness` | wellness | Mappa från Garmin `sleeps.overallSleepScore`; readiness → Body Battery eller utelämna |
| map.png / power.png | streams | Frontend-rendering (`ActivityMap`, recharts) |
| best-efforts | streams | `computeIntervalsFromStreams`-logiken (redan lokal) |
| FTP/VO2max-uppdatering | 5-min watts | `processActivity`-logiken (redan lokal) |

---

## 2. Garmin-implementering — design (verifierad mot officiella specar v2.0/2.1)

### 2.1 Tier: Starter (business) — push only, ingen historik

Verifierat ur Start Guide 2.0 + API-specarna:
- ≤1000 anslutna användare, **en** client ID per licensee, app markeras "unverified"
- Krav: **publikt nåbar webbsajt + publicerad privacy policy** (för Garmins review)
- Push-only: alla notifikationer konfigureras per summary-typ på
  `https://apis.garmin.com/tools/endpoints` — HTTPS POST, data inline i body
- **"Other protocols and non-standard ports are not supported"** — notifikations-URL:er måste vara
  standard-HTTPS på port 443. `:50505` godkänns troligen EJ → stunnel/proxy måste lyssna på 443
  (samma begränsning kan gälla OAuth redirect_uri — verifiera i portalen)
- Enabled/On Hold per typ: On Hold köar notifikationer i ≤7 dagar (bra vid underhåll)
- Ny domän triggar security review 24–48h i endpoint-verktyget
- Server-till-server only; "ad hoc requests for data are not permitted"

### 2.2 OAuth 2.0 PKCE-flöde (officiell spec, bekräftad)

```
Authorize:  GET https://connect.garmin.com/oauth2Confirm
            ?response_type=code&client_id=..&code_challenge=S256(..)
            &code_challenge_method=S256&redirect_uri=..&state=..

Token:      POST https://diauth.garmin.com/di-oauth2-service/oauth/token
            Authorization: Basic base64(client_id:client_secret)
            form: grant_type=authorization_code|refresh_token, code, code_verifier,
                  redirect_uri (= steg 1-värdet)

UserId:     GET  https://apis.garmin.com/partner-gateway/rest/user/id
Disconnect: DELETE https://apis.garmin.com/partner-gateway/rest/user/registration
Perms:      GET  https://apis.garmin.com/partner-gateway/rest/user/permissions
```

Svar: `access_token, expires_in:86400 (24h), refresh_token,
refresh_token_expires_in:~7775998 (90d), scope:"PARTNER_WRITE PARTNER_READ
CONNECT_READ CONNECT_WRITE" (fast scope)` — refresh token **roteras vid varje
refresh**, spara alltid nya. Dra av ≥600s från expires_in. Token exchange ska
ALLTID ske från backend (aldrig klient). Behörigheter användaren kan ge:
`ACTIVITY_EXPORT, HEALTH_EXPORT, WORKOUT_IMPORT, COURSE_IMPORT, MCT_EXPORT
(HISTORICAL_DATA_EXPORT = Enterprise only)`. userId är persistent över
om-registreringar (samma Garmin-konto → samma API userId).

### 2.3 Push Service — officiella krav

- Timeout **30s**; svara **HTTP 200 INNAN all bearbetning** (async obligatoriskt)
- Retry: en gång/timme i upp till **7 dagar** vid non-200
- **Header `garmin-client-id`** skickas med varje POST (+ userId i items) —
  validera den mot din client-id istf. path-token (specens curl-exempel visar
  även `user-agent: Garmin Health API`)
- Käll-IP:n att whitelist:a (valfritt extra lager):
  `204.77.162.0/23, 204.77.163.0/24, 98.199.124.0/23, 185.132.79.0/24,
  208.65.206.0/23, 185.207.94.0/23, 198.233.176.0/24`
- **Uppdaterade summaries:** samma userId+startTime+type kan komma igen med
  nyare data → alltid UPSERT, senaste vinner (sleep/dailies uppdateras ofta)
- Summary-typer Health API: `dailies, epochs, sleeps, bodyComps, stressDetails,
  userMetrics, pulseox, allDayRespiration, healthSnapshot, hrv, bloodPressures,
  skinTemp, nutrition, hydration, breathingVariations`
- Summary-typer Activity API: `activities, activityDetails, activityFiles,
  moveIQActivities, manuallyUpdatedActivities`
- Special-nycklar: `deregistrations` ([{userId}]) + `userPermissionsChange`
  ([{userId, summaryId, permissions[], changeTimeInSeconds}]) → svara 200,
  radera connection vid deregistration

### 2.4 Activity API — payloads (bekräftade fält)

**activities** (summary): `summaryId, activityId, activityType, activityName,
startTimeInSeconds, startTimeOffsetInSeconds, durationInSeconds,
averageSpeedInMetersPerSecond, distanceInMeters, activeKilocalories,
averageHeartRateInBeatsPerMinute, maxHeartRateInBeatsPerMinute,
averageBikeCadenceInRoundsPerMinute, averageRunCadenceInStepsPerMinute,
averagePaceInMinutesPerKilometer, steps, totalElevationGainInMeters,
totalElevationLossInMeters, startingLatitude/LongitudeInDegree, deviceName,
isParent, parentSummaryId (MULTI_SPORT-barn!), manual, isWebUpload`

**activityDetails**: `{ summary: {samma som activities}, samples: [{startTimeInSeconds,
latitudeInDegree, longitudeInDegree, elevationInMeters, airTemperatureCelcius,
heartRate, speedMetersPerSecond, stepsPerMinute, totalDistanceInMeters,
timerDurationInSeconds, clockDurationInSeconds, movingDurationInSeconds,
powerInWatts, bikeCadenceInRPM, swimCadenceInStrokesPerMinute}],
laps: [{startTimeInSeconds}] }` — max 24h-pass, samples ~1Hz "valid until next"
→ mappa rakt in i `garmin_activity_streams.streams_json` (Intervals-format:
time←timerDurationInSeconds, watts←powerInWatts, heartrate←heartRate,
velocity_smooth←speedMetersPerSecond, distance←totalDistanceInMeters,
latlng←lat/lng, altitude←elevationInMeters, cadence←bikeCadence|stepsPerMinute)

**activityFiles**: `{userId, summaryId:"<id>-file", fileType:"FIT|TCX|GPX",
callbackURL, activityType, deviceName, startTimeInSeconds, activityId,
activityName, activityDescription?, manual}` — callbackURL giltig **24h**,
**EN** nedladdning (dup → HTTP 410), token i URL-param. Starter-limit 50/min.
Behövs ej i fas 1 (activityDetails täcker <24h-pass) men köa i garmin_file_queue.

**moveIQActivities** / **manuallyUpdatedActivities**: auto-detecterade resp.
manuellt redigerade pass — lagra som aktiviteter, flagga `manual`.

### 2.5 Training API v2 — push av pass till Garmin

Endpoints (Bearer):
```
POST   https://apis.garmin.com/workoutportal/workout/v2        ← create (obs: workoutportal!)
GET    https://apis.garmin.com/training-api/workout/v2/{workoutId}
PUT    https://apis.garmin.com/training-api/workout/v2/{workoutId}
DELETE https://apis.garmin.com/training-api/workout/v2/{workoutId}

POST   https://apis.garmin.com/training-api/schedule/          {workoutId, date:"YYYY-mm-dd"}
GET/PUT/DELETE https://apis.garmin.com/training-api/schedule/{workoutScheduleId}
GET    https://apis.garmin.com/training-api/schedule?startDate&endDate
```

Workout-JSON (v2 = segments-modell):
`workoutName, description(≤1024), sport (RUNNING|CYCLING|LAP_SWIMMING|
STRENGTH_TRAINING|CARDIO_TRAINING|GENERIC|YOGA|PILATES|MULTI_SPORT),
poolLength/-Unit (swim), workoutProvider, workoutSourceId (≤20 tecken),
isSessionTransitionEnabled, segments:[{segmentOrder, sport, steps:[...]}]`

Step: `type: WorkoutStep|WorkoutRepeatStep, stepOrder, intensity
(REST|WARMUP|COOLDOWN|RECOVERY|ACTIVE|INTERVAL|MAIN), description(≤512),
durationType (TIME|DISTANCE|HR_LESS_THAN|HR_GREATER_THAN|CALORIES|OPEN|
POWER_LESS_THAN|POWER_GREATER_THAN|REPS|FIXED_REST|LAP_BUTTON-likn.),
durationValue, durationValueType(PERCENT), targetType (SPEED|HEART_RATE|
CADENCE|POWER|GRADE|RESISTANCE|POWER_3S/10S/30S|POWER_LAP|SPEED_LAP|
HEART_RATE_LAP|PACE|OPEN), targetValue (zon 1-5 HR / 1-7 power),
targetValueLow/High (custom range), targetValueType(PERCENT),
secondaryTarget*` (+ swim-fält: strokeType, drillType, equipmentType,
exerciseCategory/Name för styrka/kondition).

RepeatStep: `repeatType: REPEAT_UNTIL_STEPS_CMPLT|REPEAT_UNTIL_TIME|
REPEAT_UNTIL_DISTANCE|REPEAT_UNTIL_CALORIES|REPEAT_UNTIL_HR_*|
REPEAT_UNTIL_POWER_*` + `repeatValue` + `steps:[...]` (nästlat).

Gränser: 100 steg/single-sport, 25 segment + 250 steg/multisport.
Svarskoder: 200/204 ok, 400, 401 (UAT saknas), 403, 412 (permission saknas),
429 (rate limit).

**Rate limits Starter:** 100 req/min per app (OAuth+API räknat ihop),
**200 req/användare/dygn** — viktigt: schemalägg workout-pushar sparsamt,
batcha ej per aktivitet.

### 2.6 Nya tabeller (MySQL — docs/sql/001_garmin_schema.sql)

```sql
garmin_connections
  id PK, user_id FK, garmin_user_id VARCHAR UNIQUE,
  access_token TEXT (krypterad), refresh_token TEXT (krypterad),
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
  streams_json MEDIUMTEXT   -- normaliserat Intervals-format:
  -- {time:[], watts:[], heartrate:[], velocity_smooth:[],
  --  distance:[], latlng:[[..]], altitude:[], cadence:[]}

garmin_activity_intervals
  id PK, activity_id FK, start_idx, end_idx, duration_s,
  type (WORK/REST/...), avg_watts, max_watts, avg_hr, start_hr, end_hr, hrr, zone

garmin_wellness
  id PK, user_id FK, summary_type VARCHAR, summary_date DATE,
  payload_json MEDIUMTEXT, UNIQUE(user_id, summary_type, summary_date)

garmin_push_inbox          -- dedup + async-kö + retry-skydd
  id PK, summary_type VARCHAR, summary_id VARCHAR,
  payload_json MEDIUMTEXT, status (PENDING/PROCESSED/FAILED/IGNORED),
  attempts INT, received_at, processed_at,
  UNIQUE(summary_type, summary_id)

garmin_file_queue          -- activityFiles/FIT-hämtning
  id PK, user_id FK, summary_id VARCHAR, callback_url TEXT,
  file_type VARCHAR, status, fit_bytes MEDIUMBLOB, created_at, fetched_at
```

### 2.7 Nya klasser (paket `com.sgen.garmin`)

| Klass | Ansvar |
|---|---|
| `GarminOAuthService` | Bygga authorize-URL (PKCE), exchange code→tokens, refresh (schemalagd + on-demand), `user/id`, `DELETE /registration` |
| `GarminApiClient` / `GarminClientFactory` | WebClient per user med Bearer + auto-refresh (parallell med IntervalsClientFactory) |
| `GarminConnectionController` | `GET /api/garmin/status`, `POST /api/garmin/connect-url` (popup-flöde som Strava), `GET /api/garmin/callback` (permitAll → exchange → redirect till `garmin-callback.html`), `DELETE /api/garmin/disconnect` |
| `GarminPushController` | `POST /api/garmin/push/{token}` (permitAll, validera path-token) → persist `garmin_push_inbox` → 200 direkt |
| `GarminPushProcessor` (@Async) | Dispatcha per toppnivånyckel: `activities, activityDetails, dailies, sleeps, hrv, bodyComps, userMetrics, stressDetails, pulseOx, respiration, bloodPressures, skinTemp, moveiq, activityFiles, deregistrations, userPermissionsChange` |
| `GarminActivityMapper` | push-item → `garmin_activities` + streams (ur `activityDetails` ~1Hz-samples) + intervall-detektion + load |
| `GarminWellnessMapper` | hrv/sleeps/dailies/bodyComps/userMetrics → `garmin_wellness` + normaliserade fält (restingHR, hrv, sleepSecs, sleepScore, weight) |
| `TrainingLoadCalculator` | TSS ur NP (watts), hrTSS/TRIMP-fallback för HR-only-pass |
| `FitnessModelService` | Daglig load (Garmin lokalt + Intervals `icu_training_load`) → CTL/ATL/TSB EMA + rampRate → egen `daily_fitness`-tabell eller on-the-fly |
| `ZoneTimeCalculator` | Zontider ur streams + lokala sport-zoner |
| `CurveCalculator` | Power/pace/HR-kurvor ur streams (bygg på pace-logiken) |
| `IntervalDetectionService` | WORK/REST-intervall ur streams (eller lap-data i activityDetails/FIT) |
| `GarminWorkoutService` | `POST /training-api/workout` → `POST /training-api/schedule` (+ ev. DELETE — verifiera i portalspec) |
| `GarminWorkoutMapper` | `workout_doc`/ZWO → Garmin workout JSON (steps, repeats, targets; %FTP→watt via lokalt sport-FTP) |
| `GarminMergeService` | Unified read: Intervals-aktiviteter + `garmin_activities` → samma JSON-shape; dedup `start_time ±2min + duration ±10%` |
| `GarminFileService` | `activityFiles`-callbackURL → ladda FIT → (fas 2: FIT-parse; fas 1: räcker med activityDetails) |

### 2.8 Ändringar i befintlig kod

- `SecurityConfig`: `permitAll` på `/api/garmin/callback`, `/api/garmin/push/**`, `/garmin-callback.html`
- `fetchAllData`: appenda lokala Garmin-aktiviteter till `activities`-arrayen (samma shape, `source:'GARMIN'`)
- `getActivityDetails`: routa `garmin_*`-id:n → lokal store
- Wellness-fetch: merga `garmin_wellness` → Intervals-shape (`id=datum, hrv, restingHR, sleepSecs, sleepScore, weight, ctl, atl`)
- CalendarController/event-create: efter Intervals event-POST → även `GarminWorkoutService.pushWorkout` (async, fail-safe)
- `UPDATABLE_PROFILE_FIELDS`: vid Garmin-connect — stäng `icu_garmin_*` i Intervals (PUT athlete)
- `application.yml`: `garmin.client-id/secret/redirect-uri/push-token/api-base`
- Frontend: `garmin-callback.html` (kopia av strava-callback), Connections-sidan: Garmin-knapp istället för/efter Strava-borttagning

### 2.9 Strava-borttagning (samma branch)

`StravaService`, `StravaCallbackController`, `StravaStatisticsController`,
`StravaNotConnectedException`, `StravaRateLimitException`, User-entity strava-fält,
`stravaOAuth.js`, `strava-callback.html`, `STRAVA_REDIRECT_URI` i deploy-script,
`strava:` i application.yml, frontend-strava-sektioner, DB-migration som droppar kolumner.

### 2.10 Portal-värden (att fylla i hos Garmin) — BEKRÄFTADE

```
Logo:           https://raw.githubusercontent.com/eskimos20/SGEN/main/frontend/public/logo.png
Redirect URI:   https://eskimoshome.freeddns.org/api/garmin/callback      ← utan port! (443)
Push endpoints (alla typer, samma URL, konfigureras på apis.garmin.com/tools/endpoints):
                https://eskimoshome.freeddns.org/api/garmin/push
```

**⚠️ PORT-KRAV:** Specen säger explicit "non-standard ports are not supported".
`eskimoshome.freeddns.org:50505` funkar troligen EJ för notifikations-URL:er
(eventuellt inte heller för redirect_uri). Servern måste svara på
**standard-HTTPS port 443** → stunnel/proxy måste flyttas till 443, eller en
separat vhost/subdomän på 443 som proxar till backend:8081.

Validering av inkommande notifikationer (istf. path-token):
kolla header `garmin-client-id` == vår client id + userId finns i
garmin_connections. (IP-whitelist finns också som extra lager, se 2.3.)

Aktivera per summary-typ: Activity API (activities, activityDetails,
activityFiles), Health API (dailies, sleeps, hrv, bodyComps, userMetrics,
stressDetails, epochs, pulseox, allDayRespiration, bloodPressures, skinTemp),
Training API + permissions WORKOUT_IMPORT/ACTIVITY_EXPORT/HEALTH_EXPORT.
Deregistrations + UserPermission-webhooken ska också peka hit.

Övriga Starter-krav: publik sajt + publicerad privacy policy, ≤1000 users.

### 2.11 Återstående öppna punkter

- Testa om portalen accepterar redirect_uri/push-URL med :50505 (annars 443-omkonfig, se ovan)
- Exakt payload för `userPermissionsChange` vid revoked HEALTH_EXPORT (markera connection NEEDS_REAUTH)
- Om `activityFiles` pushas till Starter (annars enbart activityDetails — ok för <24h-pass)
- Svarsdetaljer vid Training API 400-fel (fältnivå-feedback)
