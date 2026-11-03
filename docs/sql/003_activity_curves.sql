-- Precomputed per-activity curves for fast local curve-history
ALTER TABLE intervals_activity_streams ADD COLUMN curves_json MEDIUMTEXT NULL;
