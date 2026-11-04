-- =============================================================
-- SGEN — schema expansion 006
-- activity_analysis: per-activity power-window analysis written
-- once at storage time. Top-3 FTP/VO2 tables are fed from these
-- rows; statistics reads never re-analyze streams.
-- Run:  mysql -u <user> -p eskimos_sgen_db < docs/sql/006_activity_analysis.sql
-- Safe to run multiple times.
-- =============================================================

CREATE TABLE IF NOT EXISTS activity_analysis (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    activity_id   VARCHAR(64)  NOT NULL,
    status        VARCHAR(16)  NOT NULL,
    best5min_avg  DOUBLE       NULL,
    activity_name VARCHAR(255) NULL,
    activity_type VARCHAR(64)  NULL,
    activity_date DATE         NULL,
    indoor        BIT          NULL,
    weight_kg     DOUBLE       NULL,
    computed_at   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_activity_analysis (user_id, activity_id),
    KEY idx_analysis_user (user_id)
);
