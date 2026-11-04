package com.sgen.service.garmin;

/**
 * Published after activity streams are persisted to the mirror.
 * ActivityAnalysisService listens and queues stream analysis so
 * FTP/VO2 candidates are computed once at storage time instead of
 * during statistics requests.
 */
public class StreamsPersistedEvent {

    private final Long userId;
    private final String activityId;

    public StreamsPersistedEvent(Long userId, String activityId) {
        this.userId = userId;
        this.activityId = activityId;
    }

    public Long getUserId() { return userId; }
    public String getActivityId() { return activityId; }
}
