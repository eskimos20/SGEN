-- =============================================================
-- SGEN — schema expansion 009
-- intervals_activity_id on garmin_activities: the upstream id of the
-- FIT copy GarminFileService uploads to Intervals.icu, so edits and
-- deletes can address it directly instead of timestamp heuristics.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/009_garmin_intervals_link.sql
-- Safe to run multiple times.
-- =============================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'garmin_activities'
             AND COLUMN_NAME = 'intervals_activity_id');
SET @s := IF(@c = 0,
             'ALTER TABLE garmin_activities ADD COLUMN intervals_activity_id VARCHAR(32) NULL',
             'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
