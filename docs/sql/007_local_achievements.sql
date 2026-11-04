-- =============================================================
-- SGEN — schema expansion 007
-- Local achievement detection: per-duration power records,
-- per-distance pace records, best-windows cache on analysis rows,
-- and extra effort fields on achievements.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/007_local_achievements.sql
-- Safe to run multiple times.
-- =============================================================

CREATE TABLE IF NOT EXISTS user_power_records (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    duration_s    INT          NOT NULL,
    watts         DOUBLE       NOT NULL,
    activity_id   VARCHAR(64)  NOT NULL,
    activity_date DATE         NULL,
    updated_at    DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_power_record (user_id, duration_s)
);

CREATE TABLE IF NOT EXISTS user_pace_records (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    distance_m    INT          NOT NULL,
    pace_mps      DOUBLE       NOT NULL,
    activity_id   VARCHAR(64)  NOT NULL,
    activity_date DATE         NULL,
    updated_at    DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pace_record (user_id, distance_m)
);

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'activity_analysis'
             AND COLUMN_NAME = 'best_windows_json');
SET @s := IF(@c = 0,
             'ALTER TABLE activity_analysis ADD COLUMN best_windows_json MEDIUMTEXT NULL',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'user_achievements'
             AND COLUMN_NAME = 'effort_distance');
SET @s := IF(@c = 0,
             'ALTER TABLE user_achievements ADD COLUMN effort_distance DOUBLE NULL, ADD COLUMN effort_pace DOUBLE NULL',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
