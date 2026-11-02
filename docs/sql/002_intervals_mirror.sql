-- Intervals.icu local mirror (verbatim payloads) for full offline serving
CREATE TABLE IF NOT EXISTS intervals_activities (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    activity_id VARCHAR(64) NOT NULL,
    start_date_local DATETIME NULL,
    moving_time_s INT NULL,
    training_load DOUBLE NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_act (user_id, activity_id),
    KEY idx_intl_act_user_date (user_id, start_date_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS intervals_activity_streams (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    activity_id VARCHAR(64) NOT NULL,
    streams_json MEDIUMTEXT NOT NULL,
    intervals_json MEDIUMTEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_streams (user_id, activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS intervals_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_id VARCHAR(64) NOT NULL,
    category VARCHAR(32) NULL,
    start_date_local DATETIME NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_event (user_id, event_id),
    KEY idx_intl_event_user_date (user_id, start_date_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
