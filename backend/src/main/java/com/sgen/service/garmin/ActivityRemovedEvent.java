package com.sgen.service.garmin;

/**
 * Published when a mirrored activity is removed (deleted upstream and
 * pruned from the mirror). ActivityAnalysisService listens and purges
 * the analysis row plus every result the activity produced.
 */
public class ActivityRemovedEvent {

    private final Long userId;
    private final String activityId;

    public ActivityRemovedEvent(Long userId, String activityId) {
        this.userId = userId;
        this.activityId = activityId;
    }

    public Long getUserId() { return userId; }
    public String getActivityId() { return activityId; }
}
