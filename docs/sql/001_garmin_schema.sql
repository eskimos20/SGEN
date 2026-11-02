-- =============================================================
-- SGEN Garmin integration — schema expansion
-- MySQL 8 / InnoDB / utf8mb4
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/001_garmin_schema.sql
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- Does not touch any existing tables.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Garmin OAuth connection per user
--    Tokens are stored encrypted (AES in the application layer, the
--    column is TEXT). garmin_user_id is Garmin's pseudonymous id — no PII.
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
    consent_ai_processing TINYINT(1) NOT NULL DEFAULT 0,          -- required by Garmin's agreement for AI analysis
    consent_at          DATETIME     NULL,                        -- policy consent (anonymized data storage)
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_garmin_conn_user UNIQUE (user_id),
    CONSTRAINT uq_garmin_conn_garmin_user UNIQUE (garmin_user_id),
    CONSTRAINT fk_garmin_conn_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. Inbox for push notifications (dedup + async processing)
--    One row per ITEM in the push body, not per POST.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_push_inbox (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    summary_type    VARCHAR(64)  NOT NULL,          -- activities, sleeps, dailies, hrv, ...
    summary_id      VARCHAR(128) NULL,              -- Garmin's summaryId (dedup key)
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
-- 3. Completed activities (summary level from activities push)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_activities (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT       NOT NULL,
    garmin_activity_id  BIGINT       NOT NULL,
    summary_id          VARCHAR(128) NULL,
    name                VARCHAR(255) NULL,
    activity_type       VARCHAR(64)  NULL,      -- raw Garmin type: RUNNING, CYCLING, LAP_SWIMMING ...
    sport_type          VARCHAR(32)  NULL,      -- normalized: ride | run | swim | other
    start_time          BIGINT       NOT NULL,  -- epoch seconds (UTC)
    start_time_offset   INT          NULL,      -- offset to local time, seconds
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
    training_load       DOUBLE       NULL,      -- self-computed TSS (TrainingLoadCalculator)
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
-- 4. Time series per activity (from activityDetails, ~1Hz)
--    Normalized to the same format as the Intervals streams object:
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
-- 5. Calculated/detected intervals per activity
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
-- 6. Wellness data (sleeps, dailies, hrv, bodyComps, userMetrics ...)
--    Raw payload + normalized fields for an Intervals-compatible view.
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
-- 7. Queue for activityFiles / FIT fetching (callbackURL, short-lived)
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
-- 8. Tracking of planned workouts pushed to Garmin (Training API)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS garmin_workout_pushes (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT       NOT NULL,
    calendar_event_id   BIGINT       NULL,          -- link to calendar_events.id
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
-- 9. Daily training load per source (own CTL model)
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
-- 10. Materialized fitness series (CTL/ATL/TSB + rampRate)
--     Computed by FitnessModelService over the combined daily load.
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
-- 11. Local sport settings (FTP/LTHR/zones) for calculations
--     when the user has no Intervals connection.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_sport_settings (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT      NOT NULL,
    sport_key    VARCHAR(32) NOT NULL,        -- ride | run | swim | ...
    display_name VARCHAR(64) NULL,
    types_json   MEDIUMTEXT  NULL,            -- mapped activity types
    ftp          INT         NULL,
    indoor_ftp   INT         NULL,
    lthr         INT         NULL,
    threshold_pace DOUBLE    NULL,            -- s/km
    zones_json   MEDIUMTEXT  NULL,            -- power/HR zone boundaries
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_local_sport UNIQUE (user_id, sport_key),
    CONSTRAINT fk_local_sport_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Garmin OAuth credentials managed via admin panel (alternative to env vars)
-- NOTE: plain ADD COLUMN — MySQL does not support "IF NOT EXISTS" on ALTER
ALTER TABLE app_settings ADD COLUMN garmin_client_id VARCHAR(128) NULL;
ALTER TABLE app_settings ADD COLUMN garmin_client_secret VARCHAR(256) NULL;
ALTER TABLE app_settings ADD COLUMN garmin_redirect_uri VARCHAR(512) NULL;

-- Intervals.icu local mirror (verbatim payloads) for full offline serving
CREATE TABLE IF NOT EXISTS intervals_activities (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    activity_id VARCHAR(64) NOT NULL,
    start_date_local DATETIME NULL,
    moving_time_s INT NULL,
    training_load DOUBLE NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_act (user_id, activity_id),
    KEY idx_intl_act_user_date (user_id, start_date_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS intervals_activity_streams (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    activity_id VARCHAR(64) NOT NULL,
    streams_json MEDIUMTEXT NOT NULL,
    intervals_json MEDIUMTEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_streams (user_id, activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS intervals_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    category VARCHAR(32) NULL,
    start_date_local DATETIME NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_event (user_id, event_id),
    KEY idx_intl_event_user_date (user_id, start_date_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS intervals_wellness (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    wellness_date DATE NOT NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_wellness (user_id, wellness_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
