-- =============================================================
-- SGEN — schema expansion 008
-- activity_type on the record tables so the all-time best curve
-- can be grouped per sport without joining back to activities.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/008_record_activity_type.sql
-- Safe to run multiple times.
-- =============================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'user_power_records'
             AND COLUMN_NAME = 'activity_type');
SET @s := IF(@c = 0,
             'ALTER TABLE user_power_records ADD COLUMN activity_type VARCHAR(64) NULL',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'user_pace_records'
             AND COLUMN_NAME = 'activity_type');
SET @s := IF(@c = 0,
             'ALTER TABLE user_pace_records ADD COLUMN activity_type VARCHAR(64) NULL',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill from the mirror activities.
UPDATE user_power_records r
JOIN intervals_activities a ON a.user_id = r.user_id AND a.activity_id = r.activity_id
SET r.activity_type = a.activity_type
WHERE r.activity_type IS NULL;

UPDATE user_pace_records r
JOIN intervals_activities a ON a.user_id = r.user_id AND a.activity_id = r.activity_id
SET r.activity_type = a.activity_type
WHERE r.activity_type IS NULL;
