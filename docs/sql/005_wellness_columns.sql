-- Columnar projection for fast local wellness serving (populated at persist)
ALTER TABLE intervals_wellness
  ADD COLUMN ctl DOUBLE NULL,
  ADD COLUMN atl DOUBLE NULL,
  ADD COLUMN tsb DOUBLE NULL,
  ADD COLUMN ramp_rate DOUBLE NULL,
  ADD COLUMN hrv DOUBLE NULL,
  ADD COLUMN resting_hr INT NULL,
  ADD COLUMN sleep_secs INT NULL,
  ADD COLUMN sleep_score DOUBLE NULL,
  ADD COLUMN weight_kg DOUBLE NULL,
  ADD COLUMN sp_o2 DOUBLE NULL,
  ADD COLUMN readiness DOUBLE NULL,
  ADD COLUMN fatigue DOUBLE NULL,
  ADD COLUMN mood DOUBLE NULL,
  ADD COLUMN soreness DOUBLE NULL,
  ADD COLUMN stress DOUBLE NULL,
  ADD COLUMN projected TINYINT(1) NOT NULL DEFAULT 0;
