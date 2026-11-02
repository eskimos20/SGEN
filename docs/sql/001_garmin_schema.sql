-- =============================================================
-- SGEN Garmin-integration — schema-utbyggnad
-- MySQL 8 / InnoDB / utf8mb4
-- Kör:  mysql -u <user> -p eskimos_sgen_db < docs/sql/001_garmin_schema.sql
-- Säker att köra flera gånger (IF NOT EXISTS överallt).
-- Rör inga befintliga tabeller.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Garmin OAuth-connection per användare
--    Tokens lagras krypterade (AES i applikationslagret, kolumnen
--    är TEXT). garmin_user_id är Garmins pseudonyma id — ingen PII.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_connections (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT       NOT NULL,
    garmin_user_id      VARCHAR(64)  NULL,
    access_token        TEXT         NULL,
    refresh_token       TEXT         NULL,
    token_expires_at    DATETIME     NULL,
    refresh_expires_at  DATETIME     NULL,
    scopes              VARCHAR(512) NULL,
    status              VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | NEEDS_REAUTH | REVOKED
    consent_ai_processing TINYINT(1) NOT NULL DEFAULT 0,          -- krävs av Garmins avtal för AI-analys
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_garmin_conn_user UNIQUE (user_id),
    CONSTRAINT uq_garmin_conn_garmin_user UNIQUE (garmin_user_id),
    CONSTRAINT fk_garmin_conn_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. Inkorg för push-notifikationer (dedup + async-bearbetning)
--    En rad per ITEM i push-bodyn, inte per POST.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_push_inbox (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    summary_type    VARCHAR(64)  NOT NULL,          -- activities, sleeps, dailies, hrv, ...
    summary_id      VARCHAR(128) NULL,              -- Garmins summaryId (dedup-nyckel)
    payload_json    MEDIUMTEXT   NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',  -- PENDING | PROCESSING | PROCESSED | FAILED | IGNORED | DUPLICATE
    attempts        INT          NOT NULL DEFAULT 0,
    last_error      VARCHAR(1024) NULL,
    received_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at    DATETIME     NULL,
    CONSTRAINT uq_garmin_inbox UNIQUE (summary_type, summary_id),
    INDEX idx_garmin_inbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3. Färdiga aktiviteter (summary-nivå från activities-push)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_activities (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT       NOT NULL,
    garmin_activity_id  BIGINT       NOT NULL,
    summary_id          VARCHAR(128) NULL,
    name                VARCHAR(255) NULL,
    activity_type       VARCHAR(64)  NULL,      -- rå Garmin-typ: RUNNING, CYCLING, LAP_SWIMMING ...
    sport_type          VARCHAR(32)  NULL,      -- normaliserad: ride | run | swim | other
    start_time          BIGINT       NOT NULL,  -- epoch sekunder (UTC)
    start_time_offset   INT          NULL,      -- offset till lokal tid, sekunder
    start_date_local    DATETIME     NULL,
    duration_s          INT          NULL,
    moving_time_s       INT          NULL,
    distance_m          DOUBLE       NULL,
    calories            INT          NULL,
    avg_hr              INT          NULL,
    max_hr              INT          NULL,
    avg_power           DOUBLE       NULL,
    norm_power          DOUBLE       NULL,
    max_power           DOUBLE       NULL,
    avg_speed           DOUBLE       NULL,      -- m/s
    avg_cadence         DOUBLE       NULL,
    elevation_gain      DOUBLE       NULL,
    elevation_loss      DOUBLE       NULL,
    training_load       DOUBLE       NULL,      -- egenberäknad TSS (TrainingLoadCalculator)
    manual              TINYINT(1)   NOT NULL DEFAULT 0,
    device_name         VARCHAR(128) NULL,
    source              VARCHAR(16)  NOT NULL DEFAULT 'GARMIN',
    raw_json            MEDIUMTEXT   NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_garmin_act_user_garmin UNIQUE (user_id, garmin_activity_id),
    CONSTRAINT uq_garmin_act_summary UNIQUE (summary_id),
    INDEX idx_garmin_act_user_time (user_id, start_time),
    INDEX idx_garmin_act_user_date (user_id, start_date_local),
    CONSTRAINT fk_garmin_act_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. Tidsserier per aktivitet (från activityDetails, ~1Hz)
--    Normaliserat till samma format som Intervals streams-objekt:
--    {time:[], watts:[], heartrate:[], velocity_smooth:[],
--     distance:[], latlng:[[lat,lng]], altitude:[], cadence:[]}
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_activity_streams (
    activity_id   BIGINT     NOT NULL PRIMARY KEY,
    streams_json  MEDIUMTEXT NOT NULL,
    sample_count  INT        NULL,
    CONSTRAINT fk_garmin_streams_act FOREIGN KEY (activity_id) REFERENCES garmin_activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 5. Beräknade/detekterade intervall per aktivitet
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_activity_intervals (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    activity_id   BIGINT      NOT NULL,
    step_order    INT         NOT NULL,
    start_index   INT         NULL,
    end_index     INT         NULL,
    duration_s    INT         NULL,
    type          VARCHAR(16) NULL,           -- WORK | RECOVERY | REST | WARMUP | COOLDOWN | LAP
    avg_watts     DOUBLE      NULL,
    max_watts     DOUBLE      NULL,
    avg_hr        DOUBLE      NULL,
    start_hr      INT         NULL,
    end_hr        INT         NULL,
    hrr           DOUBLE      NULL,
    zone          VARCHAR(8)  NULL,
    avg_speed     DOUBLE      NULL,
    avg_cadence   DOUBLE      NULL,
    INDEX idx_garmin_int_act (activity_id),
    CONSTRAINT fk_garmin_int_act FOREIGN KEY (activity_id) REFERENCES garmin_activities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 6. Wellness-data (sleeps, dailies, hrv, bodyComps, userMetrics ...)
--    Råpayload + normaliserade fält för Intervals-kompatibel vy.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_wellness (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT      NOT NULL,
    summary_type  VARCHAR(32) NOT NULL,       -- sleeps | dailies | hrv | bodyComps | userMetrics | stressDetails | pulseOx | respiration | bloodPressures | skinTemp | epochs
    summary_date  DATE        NULL,
    summary_id    VARCHAR(128) NULL,
    payload_json  MEDIUMTEXT  NOT NULL,
    received_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_garmin_well UNIQUE (summary_type, summary_id),
    INDEX idx_garmin_well_user_date (user_id, summary_type, summary_date),
    CONSTRAINT fk_garmin_well_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 7. Kö för activityFiles / FIT-hämtning (callbackURL, kortlivad)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_file_queue (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT       NULL,
    summary_id      VARCHAR(128) NOT NULL,
    garmin_activity_id BIGINT    NULL,
    callback_url    TEXT         NOT NULL,
    file_type       VARCHAR(16)  NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',  -- PENDING | FETCHED | PARSED | FORWARDED | FAILED
    attempts        INT          NOT NULL DEFAULT 0,
    last_error      VARCHAR(1024) NULL,
    url_expires_at  DATETIME     NULL,
    fit_bytes       MEDIUMBLOB   NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fetched_at      DATETIME     NULL,
    CONSTRAINT uq_garmin_file_summary UNIQUE (summary_id),
    INDEX idx_garmin_file_status (status),
    CONSTRAINT fk_garmin_file_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 8. Spårning av planerade pass pushade till Garmin (Training API)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_workout_pushes (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT       NOT NULL,
    calendar_event_id   BIGINT       NULL,          -- koppling till calendar_events.id
    intervals_event_id  INT          NULL,
    garmin_workout_id   VARCHAR(64)  NULL,
    garmin_schedule_id  VARCHAR(64)  NULL,
    workout_name        VARCHAR(255) NULL,
    scheduled_date      DATE         NULL,
    status              VARCHAR(16)  NOT NULL DEFAULT 'PENDING',  -- PENDING | CREATED | SCHEDULED | FAILED | DELETED
    last_error          VARCHAR(1024) NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_garmin_wp_user (user_id),
    INDEX idx_garmin_wp_event (calendar_event_id),
    CONSTRAINT fk_garmin_wp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_garmin_wp_event FOREIGN KEY (calendar_event_id) REFERENCES calendar_events (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 9. Daglig träningsbelastning per källa (egen CTL-modell)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_daily_load (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT      NOT NULL,
    load_date      DATE        NOT NULL,
    source         VARCHAR(16) NOT NULL,      -- GARMIN | INTERVALS | MANUAL
    training_load  DOUBLE      NOT NULL DEFAULT 0,
    activity_count INT         NOT NULL DEFAULT 0,
    updated_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_daily_load UNIQUE (user_id, load_date, source),
    CONSTRAINT fk_daily_load_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 10. Materialiserad fitness-serie (CTL/ATL/TSB + rampRate)
--     Beräknas av FitnessModelService över kombinerad daily load.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_fitness (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT      NOT NULL,
    fitness_date DATE        NOT NULL,
    daily_load   DOUBLE      NOT NULL DEFAULT 0,
    ctl          DOUBLE      NOT NULL DEFAULT 0,
    atl          DOUBLE      NOT NULL DEFAULT 0,
    tsb          DOUBLE      NOT NULL DEFAULT 0,
    ramp_rate    DOUBLE      NULL,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_fitness UNIQUE (user_id, fitness_date),
    INDEX idx_user_fitness (user_id, fitness_date),
    CONSTRAINT fk_user_fitness_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 11. Lokala sport-inställningar (FTP/LTHR/zoner) för beräkningar
--     när användaren saknar Intervals-koppling.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_sport_settings (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT      NOT NULL,
    sport_key    VARCHAR(32) NOT NULL,        -- ride | run | swim | ...
    display_name VARCHAR(64) NULL,
    types_json   MEDIUMTEXT  NULL,            -- mappade aktivitetstyper
    ftp          INT         NULL,
    indoor_ftp   INT         NULL,
    lthr         INT         NULL,
    threshold_pace DOUBLE    NULL,            -- sek/km
    zones_json   MEDIUMTEXT  NULL,            -- power-/hr-zongränser
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_local_sport UNIQUE (user_id, sport_key),
    CONSTRAINT fk_local_sport_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consent timestamp for the anonymized-data policy gate
ALTER TABLE garmin_connections ADD COLUMN IF NOT EXISTS consent_at DATETIME NULL;

-- Garmin OAuth credentials managed via admin panel (alternative to env vars)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS garmin_client_id VARCHAR(128) NULL;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS garmin_client_secret VARCHAR(256) NULL;
