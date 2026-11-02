-- =============================================================
-- SGEN Garmin integration — schema expansion 003
-- Wellness mirror + extended activity-stream mirror columns
-- MySQL 8 / InnoDB / utf8mb4
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/003_intervals_wellness.sql
-- Safe to run multiple times.
-- Does not touch any existing data.
-- =============================================================

-- Intervals wellness mirror (verbatim payloads keyed by date)
CREATE TABLE IF NOT EXISTS intervals_wellness (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    wellness_date DATE NOT NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_wellness (user_id, wellness_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extended mirror columns on intervals_activity_streams.
-- Guarded ALTERs: MySQL has no "ADD COLUMN IF NOT EXISTS", so each column
-- is only added when missing in information_schema.
SET @tbl := 'intervals_activity_streams';

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'best_efforts_json');
SET @s := IF(@c = 0, 'ALTER TABLE intervals_activity_streams ADD COLUMN best_efforts_json MEDIUMTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'map_png');
SET @s := IF(@c = 0, 'ALTER TABLE intervals_activity_streams ADD COLUMN map_png MEDIUMBLOB NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'chart_png');
SET @s := IF(@c = 0, 'ALTER TABLE intervals_activity_streams ADD COLUMN chart_png MEDIUMBLOB NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
