package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service for calculating pace curves (speed over time) for running activities.
 * Similar to power curves but for pace/speed instead of watts.
 * Garmin-connected users are computed entirely from local data — the
 * garmin_activities tables and the intervals mirror — with no Intervals
 * activity reads.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PaceCurveService {

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final ObjectMapper objectMapper;
    private final IntervalsClientFactory clientFactory;
    private final UserService userService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.GarminMergeService garminMergeService;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final com.sgen.repository.GarminActivityRepository garminActivityRepository;
    private final com.sgen.repository.GarminActivityStreamsRepository garminActivityStreamsRepository;

    /**
     * Standard duration checkpoints for pace curves (in seconds)
     */
    private static final int[] PACE_CURVE_DURATIONS = {
        30,      // 30 seconds - sprint
        60,      // 1 minute
        120,     // 2 minutes
        300,     // 5 minutes
        600,     // 10 minutes
        1200,    // 20 minutes
        1800,    // 30 minutes
        3600,    // 1 hour
        7200,    // 2 hours
        10800,   // 3 hours
        14400,   // 4 hours
        18000    // 5 hours
    };

    /**
     * Calculate pace curve for a specific activity
     */
    public PaceCurveResult calculateActivityPaceCurve(String username, String activityId) {
        // Resolve the user first — Garmin-only users may not have Intervals
        // credentials at all, so buildContext must not run before the
        // local branches.
        Long uid = userService.getUserEntityByUsername(username).getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);

        // Local path: garmin_ ids and, for Garmin-connected users, any
        // activity stored in the mirror — no Intervals reads.
        if (activityId != null && activityId.startsWith("garmin_")) {
            return localPaceCurveFromGarmin(uid, activityId);
        }
        if (garminConnected) {
            return localPaceCurveFromMirror(uid, activityId);
        }

        ApiContext ctx = apiCtx(username);
        try {
            // Get activity details
            String activityJson = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}", activityId);
            JsonNode activityNode = objectMapper.readTree(activityJson);

            // Check if it's a running activity
            String type = activityNode.path("type").asText("");
            if (!com.sgen.util.PaceMath.isRunningActivity(type)) {
                return null;
            }

            // Get streams
            String streamsJson = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}/streams", activityId);
            JsonNode streamsNode = com.sgen.service.garmin.CurveCalculator
                    .normalizeStreams(objectMapper.readTree(streamsJson));

            return buildResult(activityId, activityNode, streamsNode);
        } catch (Exception e) {
            log.error("Failed to calculate pace curve for activity {}: {}", activityId, e.getMessage());
            return null;
        }
    }

    /** Intervals client context — only built on the non-Garmin API path. */
    private ApiContext apiCtx(String username) {
        return clientFactory.buildContext(userService, username);
    }

    /** Pace curve for a garmin_ activity from garmin_activities + stored streams. */
    private PaceCurveResult localPaceCurveFromGarmin(Long uid, String activityId) {
        try {
            Long gid = Long.parseLong(activityId.substring("garmin_".length()));
            var act = garminActivityRepository.findById(gid)
                    .filter(a -> a.getUserId().equals(uid)).orElse(null);
            if (act == null) return null;
            var srow = garminActivityStreamsRepository.findByActivityId(gid).orElse(null);
            if (srow == null || srow.getStreamsJson() == null) return null;
            JsonNode streams = com.sgen.service.garmin.CurveCalculator
                    .normalizeStreams(objectMapper.readTree(srow.getStreamsJson()));
            return buildResult(activityId, garminMergeService.toIntervalsActivityJson(act), streams);
        } catch (Exception e) {
            log.debug("Local pace curve for {} failed: {}", activityId, e.getMessage());
            return null;
        }
    }

    /** Pace curve for a mirrored activity from intervals_activity(+streams). */
    private PaceCurveResult localPaceCurveFromMirror(Long uid, String activityId) {
        try {
            var row = intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId).orElse(null);
            var srow = intervalsStreamsRepository.findByUserIdAndActivityId(uid, activityId).orElse(null);
            if (row == null || srow == null || srow.getStreamsJson() == null) return null;
            JsonNode activityNode = objectMapper.readTree(row.getPayloadJson());
            JsonNode streams = com.sgen.service.garmin.CurveCalculator
                    .normalizeStreams(objectMapper.readTree(srow.getStreamsJson()));
            return buildResult(activityId, activityNode, streams);
        } catch (Exception e) {
            log.debug("Mirror pace curve for {} failed: {}", activityId, e.getMessage());
            return null;
        }
    }

    /** Shared result builder — running check + pace windows + metadata. */
    private PaceCurveResult buildResult(String activityId, JsonNode activityNode, JsonNode streamsNode) {
        String type = activityNode.path("type").asText("");
        if (!com.sgen.util.PaceMath.isRunningActivity(type)) return null;
        Map<Integer, Double> paceCurve = calculatePaceFromStreams(streamsNode);
        if (paceCurve.isEmpty()) return null;

        PaceCurveResult result = new PaceCurveResult();
        result.setActivityId(activityId);
        result.setActivityName(activityNode.path("name").asText(""));
        String ds = activityNode.path("start_date_local").asText("");
        result.setActivityDate(ds.length() >= 10 ? ds.substring(0, 10) : ds);
        result.setSportType(type);
        result.setPaceData(paceCurve);
        result.setTotalDistance(activityNode.path("distance").asDouble(0));
        result.setTotalTime(activityNode.path("moving_time").asInt(0));
        if (result.getTotalDistance() > 0 && result.getTotalTime() > 0) {
            result.setAveragePace(result.getTotalDistance() / result.getTotalTime());
        }
        return result;
    }

    /**
     * Get pace curve history across multiple activities (like power curve history)
     */
    public List<PaceCurveResult> getPaceCurveHistory(String username, String oldest, String newest) {
        List<PaceCurveResult> results = new ArrayList<>();
        Long uid = userService.getUserEntityByUsername(username).getId();

        // Garmin-connected: iterate the mirror + local Garmin activities and
        // compute everything from stored streams.
        if (garminClientFactory.isConnected(uid)) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            for (var row : intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(uid, from, to)) {
                if (!com.sgen.util.PaceMath.isRunningActivity(
                        row.getActivityType() != null ? row.getActivityType() : "")) continue;
                PaceCurveResult curve = localPaceCurveFromMirror(uid, row.getActivityId());
                if (curve != null && !curve.getPaceData().isEmpty()) results.add(curve);
            }
            for (var act : garminActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(uid, from, to)) {
                if (Boolean.TRUE.equals(act.getManual())) continue;
                if (!com.sgen.util.PaceMath.isRunningActivity(
                        garminMergeService.intervalsTypeFor(act))) continue;
                PaceCurveResult curve = localPaceCurveFromGarmin(uid, "garmin_" + act.getId());
                if (curve != null && !curve.getPaceData().isEmpty()) results.add(curve);
            }
            results.sort(Comparator.comparing(PaceCurveResult::getActivityDate).reversed());
            return results;
        }

        ApiContext ctx = apiCtx(username);
        try {
            // Get running activities in date range
            String activitiesJson = intervalsApi.getString(ctx.client, uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()));

            JsonNode activitiesNode = objectMapper.readTree(activitiesJson);

            if (!activitiesNode.isArray()) {
                return results;
            }

            // Process each running activity
            for (JsonNode activity : activitiesNode) {
                String activityId = activity.path("id").asText();
                String type = activity.path("type").asText("");

                if (com.sgen.util.PaceMath.isRunningActivity(type)) {
                    PaceCurveResult curve = calculateActivityPaceCurve(username, activityId);
                    if (curve != null && !curve.getPaceData().isEmpty()) {
                        results.add(curve);
                    }
                }
            }

            // Sort by date
            results.sort(Comparator.comparing(PaceCurveResult::getActivityDate).reversed());

            return results;

        } catch (Exception e) {
            log.error("Failed to get pace curve history: {}", e.getMessage());
            return results;
        }
    }

    /**
     * Calculate pace (m/s) for each duration checkpoint using velocity data
     */
    private Map<Integer, Double> calculatePaceFromStreams(JsonNode streamsNode) {
        if (streamsNode == null) return new LinkedHashMap<>();
        JsonNode velocityNode = streamsNode.get("velocity_smooth");
        if (velocityNode != null && velocityNode.isArray() && velocityNode.size() > 0) {
            return com.sgen.util.PaceMath.bestVelocityWindows(velocityNode, PACE_CURVE_DURATIONS);
        }
        JsonNode distanceNode = streamsNode.get("distance");
        if (distanceNode != null && distanceNode.isArray() && distanceNode.size() > 0) {
            return com.sgen.util.PaceMath.bestVelocityFromDistance(distanceNode, PACE_CURVE_DURATIONS);
        }
        return new LinkedHashMap<>();
    }

    /**
     * Convert velocity (m/s) to pace string (min:sec/km or min:sec/mile)
     */
    public static String velocityToPace(double velocityMs, boolean metric) {
        if (velocityMs <= 0) return "--:--";

        double distanceUnit = metric ? 1000 : 1609.34; // km or mile
        double secondsPerUnit = distanceUnit / velocityMs;

        int minutes = (int) (secondsPerUnit / 60);
        int seconds = (int) (secondsPerUnit % 60);

        return String.format("%d:%02d", minutes, seconds);
    }

    /**
     * Result class for pace curve data
     */
    public static class PaceCurveResult {
        private String activityId;
        private String activityName;
        private String activityDate;
        private String sportType;
        private Map<Integer, Double> paceData; // duration (sec) -> velocity (m/s)
        private double averagePace; // m/s
        private double totalDistance; // meters
        private int totalTime; // seconds

        // Getters and setters
        public String getActivityId() { return activityId; }
        public void setActivityId(String activityId) { this.activityId = activityId; }

        public String getActivityName() { return activityName; }
        public void setActivityName(String activityName) { this.activityName = activityName; }

        public String getActivityDate() { return activityDate; }
        public void setActivityDate(String activityDate) { this.activityDate = activityDate; }

        public String getSportType() { return sportType; }
        public void setSportType(String sportType) { this.sportType = sportType; }

        public Map<Integer, Double> getPaceData() { return paceData; }
        public void setPaceData(Map<Integer, Double> paceData) { this.paceData = paceData; }

        public double getAveragePace() { return averagePace; }
        public void setAveragePace(double averagePace) { this.averagePace = averagePace; }

        public double getTotalDistance() { return totalDistance; }
        public void setTotalDistance(double totalDistance) { this.totalDistance = totalDistance; }

        public int getTotalTime() { return totalTime; }
        public void setTotalTime(int totalTime) { this.totalTime = totalTime; }
    }
}
