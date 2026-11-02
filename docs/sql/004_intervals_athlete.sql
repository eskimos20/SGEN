-- =============================================================
-- SGEN Garmin integration — schema expansion 004
-- Athlete profile + sport settings mirror (one row per user)
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/004_intervals_athlete.sql
-- Safe to run multiple times.
-- =============================================================

CREATE TABLE IF NOT EXISTS intervals_athlete (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    athlete_json MEDIUMTEXT NULL,
    sport_settings_json MEDIUMTEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_athlete (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
