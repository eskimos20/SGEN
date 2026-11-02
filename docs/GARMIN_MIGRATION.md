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

## 2. Garmin-implementering — design

### 2.1 Tier: Starter (business) — push only, ingen historik

- Alla API:er använder **OAuth 2.0 + PKCE** (inte gamla 1.0a)
- Notifikationer konfigureras per summary-typ i portalen → samma endpoint
- `activities`/`activityDetails` m.fl. kommer inline i push-body
- `activityFiles` (FIT) kommer som `callbackURL` att ladda ner
- Ingen backfill/pull → data flödar först efter connect + device-synk

### 2.2 OAuth 2.0 PKCE-flöde

```
Authorize:  GET https://connect.garmin.com/oauth2Confirm
            ?response_type=code&client_id=..&code_challenge=S256(..)
            &code_challenge_method=S256&redirect_uri=..&state=..

Token:      POST https://diauth.garmin.com/di-oauth2-service/oauth/token
            grant_type=authorization_code|refresh_token

UserId:     GET  https://apis.garmin.com/wellness-api/rest/user/id   (Bearer)
Disconnect: DELETE https://apis.garmin.com/wellness-api/rest/user/registration
Perms:      GET  https://apis.garmin.com/wellness-api/rest/user/permissions
```

Access token ~24h (lita på `expires_in`), refresh ~90d, **roteras vid varje refresh**.

### 2.3 Nya tabeller (MySQL — schema.sql behövs, ddl-auto:none)

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

### 2.4 Nya klasser (paket `com.sgen.garmin`)

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

### 2.5 Ändringar i befintlig kod

- `SecurityConfig`: `permitAll` på `/api/garmin/callback`, `/api/garmin/push/**`, `/garmin-callback.html`
- `fetchAllData`: appenda lokala Garmin-aktiviteter till `activities`-arrayen (samma shape, `source:'GARMIN'`)
- `getActivityDetails`: routa `garmin_*`-id:n → lokal store
- Wellness-fetch: merga `garmin_wellness` → Intervals-shape (`id=datum, hrv, restingHR, sleepSecs, sleepScore, weight, ctl, atl`)
- CalendarController/event-create: efter Intervals event-POST → även `GarminWorkoutService.pushWorkout` (async, fail-safe)
- `UPDATABLE_PROFILE_FIELDS`: vid Garmin-connect — stäng `icu_garmin_*` i Intervals (PUT athlete)
- `application.yml`: `garmin.client-id/secret/redirect-uri/push-token/api-base`
- Frontend: `garmin-callback.html` (kopia av strava-callback), Connections-sidan: Garmin-knapp istället för/efter Strava-borttagning

### 2.6 Strava-borttagning (samma branch)

`StravaService`, `StravaCallbackController`, `StravaStatisticsController`,
`StravaNotConnectedException`, `StravaRateLimitException`, User-entity strava-fält,
`stravaOAuth.js`, `strava-callback.html`, `STRAVA_REDIRECT_URI` i deploy-script,
`strava:` i application.yml, frontend-strava-sektioner, DB-migration som droppar kolumner.

### 2.7 Portal-värden (att fylla i hos Garmin)

```
Redirect URI:   https://<DIN-DDNS>:<EXT-PORT>/api/garmin/callback
Push endpoints (alla typer, samma):
                https://<DIN-DDNS>:<EXT-PORT>/api/garmin/push/<HEMLIG-TOKEN>
                (hemligheten i path — överlever garanterat, osäkert om Garmin
                behåller query-parametrar)
```

Aktivera: Activity API (activities, activityDetails, activityFiles),
Health API (dailies, sleeps, hrv, bodyComps, userMetrics, stressDetails,
epochs, pulseOx, respiration, bloodPressures, skinTemp), Training API.

### 2.8 Öppna punkter att verifiera mot portalspecen

- Exakta fältnamn per summary-typ i push-payloads
- Om `activityFiles` ingår i Starter-push (annars: enbart activityDetails)
- Training API: fullt workout-schema, DELETE/PUT för workout & schedule, returvärden
- Notification-signatur (finns `garmin-client-id`-header eller liknande?)
- Token-livstid (24h vs 3 mån — implementera efter `expires_in`)
