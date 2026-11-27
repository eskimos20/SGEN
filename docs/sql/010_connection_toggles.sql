-- =============================================================
-- SGEN — schema expansion 010
-- On/Off toggles for connections: users.intervals_enabled and
-- garmin_connections.enabled. Off keeps credentials in the DB but
-- treats the integration as disconnected; On resumes it.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/010_connection_toggles.sql
-- Safe to run multiple times.
-- =============================================================

SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'intervals_enabled');
SET @s1 := IF(@c1 = 0,
              'ALTER TABLE users ADD COLUMN intervals_enabled BOOLEAN NOT NULL DEFAULT TRUE',
              'SELECT 1');
PREPARE stmt FROM @s1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'garmin_connections'
              AND COLUMN_NAME = 'enabled');
SET @s2 := IF(@c2 = 0,
              'ALTER TABLE garmin_connections ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE',
              'SELECT 1');
PREPARE stmt FROM @s2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
