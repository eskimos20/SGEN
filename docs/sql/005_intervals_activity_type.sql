-- =============================================================
-- SGEN — schema expansion 005
-- Indexed activity_type column on intervals_activities so
-- curve history can group by type without parsing payloads.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/005_intervals_activity_type.sql
-- Safe to run multiple times.
-- =============================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'intervals_activities'
             AND COLUMN_NAME = 'activity_type');
SET @s := IF(@c = 0,
             'ALTER TABLE intervals_activities ADD COLUMN activity_type VARCHAR(64) NULL, ADD KEY idx_intl_act_type (user_id, activity_type)',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill type for existing rows from the stored payload.
UPDATE intervals_activities
SET activity_type = JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.type'))
WHERE activity_type IS NULL;
